import { NextResponse } from "next/server";

export const runtime = "nodejs";

function withCors(resp: NextResponse) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return resp;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 200 }));
}

// GET /api/fetch-collection?site_name=...&collection_name=...&output=...&renderName=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const site_name = searchParams.get("site_name");
    const collection_name = searchParams.get("collection_name");
    const output = (searchParams.get("output") || "general").toLowerCase();

    const uname = process.env.DUDA_API_USERNAME;
    const pass = process.env.DUDA_API_PASSWORD;

    if (!uname || !pass) {
      return withCors(NextResponse.json({ error: "Missing Duda credentials" }, { status: 500 }));
    }
    if (!site_name || !collection_name) {
      return withCors(
        NextResponse.json(
          { error: "Missing required parameters: site_name and collection_name" },
          { status: 400 }
        )
      );
    }

    const { Duda } = await import("@dudadev/partner-api");
    const duda = new Duda({ user: uname, pass });

    // Always fetch raw collection first
    const collection = await duda.collections.get({ site_name, collection_name });

   // ---------- carSelection ----------
if (output === "carselection") {
  const items = Array.isArray(collection.values) ? collection.values : [];

  const options = items
    .map((v: any) => {
      const name = v?.data?.RenderName;
      const image = v?.data?.Image;
      if (typeof name !== "string" || !name.trim()) return null;
      return {
        value: image || "", // assign Image URL to value
        label: name,        // use RenderName as label
      };
    })
    .filter(Boolean);

  return withCors(
    NextResponse.json({ options }, { status: 200, headers: { "Cache-Control": "no-store" } })
  );
}


    // ---------- windowSelection ----------
    if (output === "windowselection") {
      const renderName = searchParams.get("renderName");

      // If a specific renderName is provided, return that item's WindowParts
      if (renderName) {
        const items = Array.isArray(collection.values) ? collection.values : [];
        const match = items.find(
          (v: any) => typeof v?.data?.RenderName === "string" && v.data.RenderName === renderName
        );

        if (!match) {
          return withCors(
            NextResponse.json({ error: `RenderName not found: ${renderName}` }, { status: 404 })
          );
        }

        const parts = Array.isArray(match?.data?.WindowParts) ? match.data.WindowParts : [];
        return withCors(
          NextResponse.json({ multi_select_options: parts }, { status: 200, headers: { "Cache-Control": "no-store" } })
        );
      }

      // Otherwise, fall back to the field's declared multi_select_options
      const field = (collection.fields || []).find(
        (f: any) => f?.name === "WindowParts" && f?.type === "multi_select"
      );

      if (!field || !Array.isArray(field.multi_select_options)) {
        return withCors(
          NextResponse.json(
            { error: "WindowParts field with multi_select_options not found" },
            { status: 404 }
          )
        );
      }

      return withCors(
        NextResponse.json(
          { multi_select_options: field.multi_select_options },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        )
      );
    }

    // ---------- default (general) ----------
    return withCors(
      NextResponse.json(collection, { status: 200, headers: { "Cache-Control": "no-store" } })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Duda API Error:", err);
    return withCors(
      NextResponse.json({ error: "Duda API request failed", details: message }, { status: 500 })
    );
  }
}
