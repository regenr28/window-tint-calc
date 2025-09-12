import { NextResponse } from "next/server";

// Force Node runtime (not Edge) because we're using an npm SDK and Node APIs
export const runtime = "nodejs";

// Small helper to add CORS to responses
function withCors(resp: NextResponse) {
  resp.headers.set("Access-Control-Allow-Origin", "*"); // tighten later to your domain
  resp.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return resp;
}

// Handle CORS preflight
export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 200 }));
}

// GET /api/fetch-collection?site_name=...&collection_name=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const site_name = searchParams.get("site_name");
    const collection_name = searchParams.get("collection_name");

    const uname = process.env.DUDA_API_USERNAME;
    const pass = process.env.DUDA_API_PASSWORD;

    if (!uname || !pass) {
      return withCors(
        NextResponse.json({ error: "Missing Duda credentials" }, { status: 500 })
      );
    }

    if (!site_name || !collection_name) {
      return withCors(
        NextResponse.json(
          { error: "Missing required parameters: site_name and collection_name" },
          { status: 400 }
        )
      );
    }

    // Use dynamic import so it works in Node runtime without ESM quirks
    const { Duda } = await import("@dudadev/partner-api");
    const duda = new Duda({ user: uname, pass });

    // Avoid caching dynamic API calls
    const collection = await duda.collections.get({ site_name, collection_name });

    return withCors(
      NextResponse.json(collection, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      })
    );
  } catch (err: any) {
    console.error("Duda API Error:", err);
    return withCors(
      NextResponse.json(
        { error: "Duda API request failed", details: err?.message || String(err) },
        { status: 500 }
      )
    );
  }
}
