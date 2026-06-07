import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_API_KEY_BACKUP = Deno.env.get("GEMINI_API_KEY_BACKUP") ?? "";

const prompt = `Identify the main object in this image. Respond with JSON only: {"label": "object name", "recyclable": true/false, "special": true/false, "confidence": 0.0-1.0, "weight_estimate": 0.0, "reason": "brief reason and proper disposal technique/location"}. Note: "weight_estimate" should be the estimated weight of the item in kilograms (e.g. 0.02 for a soda can, 0.15 for a plastic bottle, etc.) as a floating-point number.`;

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
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }],
        tools: [
          { google_search: {} }
        ]
      })
    }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const activeKey = GEMINI_API_KEY || GEMINI_API_KEY_BACKUP;
    if (!activeKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, zipCode } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let customPrompt = prompt;
    if (zipCode) {
      customPrompt += `\nAdditional Context: The user is located in ZIP code "${zipCode}". Please search the web or check local regulations specifically for ZIP code "${zipCode}" to determine if this item is accepted in their local curbside recycling program, needs special disposal, or is not recyclable there. Explain the local guidelines in the "reason" field.`;
    }

    let response = await callGemini(GEMINI_API_KEY, imageBase64, customPrompt);
    let json = await response.json();

    if ((json.error || !response.ok) && GEMINI_API_KEY_BACKUP) {
      console.warn("Primary Gemini API key failed or returned error, trying backup key...");
      try {
        const backupResponse = await callGemini(GEMINI_API_KEY_BACKUP, imageBase64, customPrompt);
        if (backupResponse.ok) {
          response = backupResponse;
          json = await backupResponse.json();
        }
      } catch (e) {
        console.error("Backup key attempt failed:", e);
      }
    }

    if (json.error) {
      console.error("Gemini API Error:", JSON.stringify(json.error));
      return new Response(
        JSON.stringify({ error: json.error.message ?? "Gemini API error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return new Response(
        JSON.stringify({ error: "No classification result returned" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Robust JSON extractor to handle cases where Gemini includes search citations or markdown
    const extractJson = (str: string) => {
      const start = str.indexOf('{');
      const end = str.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        return str.substring(start, end + 1);
      }
      return str;
    };

    const jsonString = extractJson(text);
    const cleaned = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse classification result", raw: cleaned }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
