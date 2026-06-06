import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const EARTH911_API_KEY = Deno.env.get("EARTH911_API_KEY") ?? "";
const EARTH911_BASE_URL = "https://api.earth911.com/earth911";

interface Site {
  name: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  phone?: string;
  url?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { zipCode, materialId } = await req.json();
    if (!zipCode || typeof zipCode !== "string") {
      return new Response(
        JSON.stringify({ error: "zipCode is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!EARTH911_API_KEY) {
      // Return empty results if no API key is configured
      return new Response(
        JSON.stringify({ sites: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let url = `${EARTH911_BASE_URL}.searchLocations?api_key=${EARTH911_API_KEY}&postal_code=${zipCode}&country=US&max_distance=50`;
    if (materialId) {
      url += `&material_id=${materialId}`;
    }

    const response = await fetch(url);
    const json = await response.json();

    const rawLocations = json?.result?.locations ?? [];
    const sites: Site[] = Array.isArray(rawLocations)
      ? rawLocations.slice(0, 10).map((loc: Record<string, unknown>) => ({
          name: (loc.name as string) ?? (loc.description as string) ?? "Recycling Center",
          description: loc.description as string | undefined,
          address: loc.address as string | undefined,
          city: loc.city as string | undefined,
          state: loc.state as string | undefined,
          postal_code: loc.postal_code as string | undefined,
          latitude: loc.latitude as number | undefined,
          longitude: loc.longitude as number | undefined,
          distance: loc.distance as number | undefined,
          phone: loc.phone as string | undefined,
          url: loc.url as string | undefined,
        }))
      : [];

    return new Response(
      JSON.stringify({ sites }),
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
