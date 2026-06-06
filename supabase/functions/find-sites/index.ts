import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
out body;
>;
out skel qt;
`;

    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Overpass API error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to query recycling locations", sites: [] }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json = await response.json();
    const elements = json?.elements ?? [];

    const sites: Site[] = elements
      .filter((el: Record<string, unknown>) => el.type === "node" && el.lat && el.lon)
      .slice(0, 20)
      .map((el: Record<string, unknown>) => {
        const tags = (el.tags ?? {}) as Record<string, string>;
        const name = tags.name || tags.operator || "Recycling Location";
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
          latitude: el.lat as number,
          longitude: el.lon as number,
          phone: tags.phone || tags["contact:phone"],
          url: tags.website || tags["contact:website"],
          category: categoryParts.length > 0 ? categoryParts.join(", ") : (tags.amenity || "recycling"),
        };
      });

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
