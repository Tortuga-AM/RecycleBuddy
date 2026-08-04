import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_API_KEY_BACKUP = Deno.env.get("GEMINI_API_KEY_BACKUP") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Trust boundary for leaderboard-eligible weights (kg).
const MAX_WEIGHT_KG = 50;
const MIN_CONFIDENCE = 0.35;
const DAILY_SCAN_LIMIT = 100;

const prompt = `Identify the main object in this image. Respond with JSON only: {"label": "object name", "recyclable": true/false, "special": true/false, "confidence": 0.0-1.0, "weight_estimate": 0.0, "reason": "brief reason and proper disposal technique/location"}. Note: "weight_estimate" should be the estimated weight of the item in kilograms (e.g. 0.02 for a soda can, 0.15 for a plastic bottle, etc.) as a floating-point number. Never return grams.`;

async function callGemini(apiKey: string, imageBase64: string, promptText: string) {
  return await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
          ],
        }],
        tools: [{ google_search: {} }],
      }),
    },
  );
}

function extractJson(str: string) {
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  return (start !== -1 && end !== -1 && end > start) ? str.substring(start, end + 1) : str;
}

/**
 * Coerce Gemini's weight into a trustworthy kg value.
 * Returns null if unusable — caller then falls back to the label table.
 */
function sanitizeWeight(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Gemini occasionally answers in grams despite the prompt.
  const kg = n > MAX_WEIGHT_KG ? n / 1000 : n;
  if (kg <= 0 || kg > MAX_WEIGHT_KG) return null;
  return Math.round(kg * 1000) / 1000; // 3dp
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ---- Auth: identify the caller from their JWT ----
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const activeKey = GEMINI_API_KEY || GEMINI_API_KEY_BACKUP;
    if (!activeKey) return json({ error: "Gemini API key not configured on server" }, 500);

    const body = await req.json();
    const { imageBase64, zipCode } = body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return json({ error: "imageBase64 is required" }, 400);
    }

    // ---- Service-role client for the privileged write ----
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ---- Rate limit: cap scans per user per rolling day ----
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("scan_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);

    if ((count ?? 0) >= DAILY_SCAN_LIMIT) {
      return json({ error: "Daily scan limit reached. Try again tomorrow." }, 429);
    }

    // ---- Classify ----
    let customPrompt = prompt;
    if (zipCode && typeof zipCode === "string" && /^[0-9A-Za-z \-]{3,10}$/.test(zipCode)) {
      customPrompt += `\nAdditional Context: The user is located in ZIP code "${zipCode}". Please search the web or check local regulations specifically for ZIP code "${zipCode}" to determine if this item is accepted in their local curbside recycling program, needs special disposal, or is not recyclable there. Explain the local guidelines in the "reason" field.`;
    }

    let response = await callGemini(activeKey, imageBase64, customPrompt);
    let payload = await response.json();

    if ((payload.error || !response.ok) && GEMINI_API_KEY_BACKUP && activeKey !== GEMINI_API_KEY_BACKUP) {
      console.warn("Primary Gemini key failed, trying backup...");
      try {
        const backup = await callGemini(GEMINI_API_KEY_BACKUP, imageBase64, customPrompt);
        const backupPayload = await backup.json();
        if (backup.ok && !backupPayload.error) {
          response = backup;
          payload = backupPayload;
        }
      } catch (e) {
        console.error("Backup key attempt failed:", e);
      }
    }

    if (payload.error) {
      console.error("Gemini API Error:", JSON.stringify(payload.error));
      return json({ error: payload.error.message ?? "Gemini API error" }, 502);
    }

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ error: "No classification result returned" }, 502);

    const cleaned = extractJson(text).replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: "Failed to parse classification result", raw: cleaned }, 502);
    }

    // ---- Normalise the model's output ----
    const label = typeof parsed.label === "string" && parsed.label.trim()
      ? parsed.label.trim().slice(0, 120)
      : "Unknown item";
    const recyclable = parsed.recyclable === true;
    const special = parsed.special === true;
    const confidence = Number.isFinite(Number(parsed.confidence))
      ? Math.min(Math.max(Number(parsed.confidence), 0), 1)
      : 0;
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 1000) : "";
    const weight = sanitizeWeight(parsed.weight_estimate);

    const status = special ? "special" : recyclable ? "recyclable" : "notRecyclable";
    const scored = confidence >= MIN_CONFIDENCE && status !== "notRecyclable";

    // ---- Persist server-side ----
    let scanId: string | null = null;
    if (confidence >= MIN_CONFIDENCE) {
      const { data: inserted, error: insertError } = await admin
        .from("scan_history")
        .insert({
          user_id: user.id,
          label,
          recyclable,
          special,
          confidence,
          weight_estimate: scored ? weight : null,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("scan_history insert failed:", insertError.message);
      } else {
        scanId = inserted.id;
      }
    }

    return json({
      id: scanId,
      label,
      recyclable,
      special,
      confidence,
      reason,
      weight_estimate: weight,
      saved: scanId !== null,
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});