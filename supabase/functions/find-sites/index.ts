import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_API_KEY_BACKUP = Deno.env.get("GEMINI_API_KEY_BACKUP") ?? "";

interface Site {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  phone?: string;
  url?: string;
  category?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { latitude, longitude, radiusKm, category } = await req.json();
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return new Response(
        JSON.stringify({ error: "latitude and longitude are required numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const radius = radiusKm ?? 25;
    const radiusMeters = Math.round(radius * 1000);

    // Build Overpass QL query - search for recycling-related POIs
    const recyclingFilters = [
      'node["amenity"="recycling"]',
      'node["amenity"="waste_disposal"]',
      'node["amenity"="waste_transfer_station"]',
      'node["recycling:type"="centre"]',
      'node["amenity"="hazardous_waste"]',
      'way["amenity"="recycling"]',
      'way["amenity"="waste_disposal"]',
    ];

    // If a specific category is requested, adjust the query
    let filters = recyclingFilters;
    if (category === "electronics") {
      filters = [
        'node["recycling:electronics"="yes"]',
        'node["recycling:batteries"="yes"]',
        'node["amenity"="hazardous_waste"]',
      ];
    } else if (category === "household_hazardous") {
      filters = [
        'node["amenity"="hazardous_waste"]',
        'node["recycling:batteries"="yes"]',
        'node["recycling:paint"="yes"]',
        'node["recycling:oil"="yes"]',
      ];
    }

    const filterUnion = filters.map(f => `${f}(around:${radiusMeters},${latitude},${longitude})`).join(";\n");

    const query = `
[out:json][timeout:25];
(
${filterUnion}
);
out center;
`;

    let sites: Site[] = [];

    // 1. Try Overpass API
    try {
      const overpassUrl = "https://overpass-api.de/api/interpreter";
      const response = await fetch(overpassUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.ok) {
        const json = await response.json();
        const elements = json?.elements ?? [];

        sites = elements
          .filter((el: Record<string, unknown>) => (el.lat && el.lon) || (el.center && typeof el.center === "object"))
          .slice(0, 15)
          .map((el: Record<string, unknown>) => {
            const tags = (el.tags ?? {}) as Record<string, string>;
            const name = tags.name || tags.operator || "Recycling Location";
            const lat = (el.lat ?? (el.center as any)?.lat) as number;
            const lon = (el.lon ?? (el.center as any)?.lon) as number;
            const categoryParts: string[] = [];
            for (const [k, v] of Object.entries(tags)) {
              if (k.startsWith("recycling:") && v === "yes") {
                categoryParts.push(k.replace("recycling:", "").replace(/_/g, " "));
              }
            }

            return {
              name,
              address: tags["addr:street"] || tags["addr:housenumber"] ? [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") : undefined,
              city: tags["addr:city"],
              state: tags["addr:state"],
              postal_code: tags["addr:postcode"],
              latitude: lat,
              longitude: lon,
              phone: tags.phone || tags["contact:phone"],
              url: tags.website || tags["contact:website"],
              category: categoryParts.length > 0 ? categoryParts.join(", ") : (tags.amenity || "recycling"),
            };
          });
      }
    } catch (e) {
      console.error("Overpass query failed:", e);
    }

    // 2. If Overpass returned 0 results or failed, use Gemini fallback!
    if (sites.length === 0 && (GEMINI_API_KEY || GEMINI_API_KEY_BACKUP)) {
      console.log("OSM returned 0 sites. Fetching fallback recommendations from Gemini...");
      try {
        const activeKey = GEMINI_API_KEY || GEMINI_API_KEY_BACKUP;
        const categoryPrompt = category ? `specifically for disposing of "${category}" items` : "for recycling/disposing of household waste, recycling, or hazardous materials";
        const geminiPrompt = `You are a helpful local recycling locator. Find 3 to 5 real recycling centers, drop-off locations, or waste management facilities near latitude ${latitude}, longitude ${longitude} ${categoryPrompt}. Provide actual addresses and estimate coordinates near the addresses. Return JSON only in this format: {"sites": [{"name": "Facility Name", "address": "123 Main St", "city": "City", "state": "State", "postal_code": "12345", "latitude": 0.0, "longitude": 0.0, "category": "electronics, paint, plastics, etc."}]}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${activeKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: geminiPrompt }]
              }],
              tools: [{ google_search: {} }]
            })
          }
        );

        if (geminiRes.ok) {
          const geminiJson = await geminiRes.json();
          const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            if (parsed && Array.isArray(parsed.sites)) {
              sites = parsed.sites;
              console.log(`Successfully loaded ${sites.length} fallback sites from Gemini.`);
            }
          }
        }
      } catch (geminiErr) {
        console.error("Gemini fallback failed:", geminiErr);
      }
    }

    return new Response(
      JSON.stringify({ sites }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", sites: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
