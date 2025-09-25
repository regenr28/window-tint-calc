import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** ---- Minimal shapes we actually use from the Duda response ---- */
type CollectionField = {
  name?: string;
  type?: string;
  multi_select_options?: string[];
};

type CollectionItemData = {
  RenderName?: string;
  Image?: string;
  WindowParts?: string[];
  [key: string]: unknown;
};

type CollectionItem = {
  id?: string;
  page_item_url?: string;
  data?: CollectionItemData;
};

type CollectionResponse = {
  fields?: CollectionField[];
  values?: CollectionItem[];
  [key: string]: unknown;
};

/** Narrow unknown to CollectionResponse without using `any` */
function asCollectionResponse(x: unknown): CollectionResponse {
  if (x && typeof x === "object") return x as CollectionResponse;
  return {};
}

function withCors(resp: NextResponse) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); // allow POST for Duda proxy
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return resp;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 200 }));
}

// Duda's editor may POST to its proxy, which forwards to your URL.
// Reuse the same logic.
export async function POST(request: Request) {
  return GET(request);
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

    // Fetch and narrow to our minimal shape
    const raw = await duda.collections.get({ site_name, collection_name });
    const col = asCollectionResponse(raw);

    const items: CollectionItem[] = Array.isArray(col.values) ? col.values : [];
    const fields: CollectionField[] = Array.isArray(col.fields) ? col.fields : [];

    // ---------- carSelection ----------
    if (output === "carselection") {
      const options = items
        .map((v): { value: string; label: string } | null => {
          const name = v?.data?.RenderName;
          const image = v?.data?.Image;
          if (!name || name.trim().length === 0) return null;
          return {
            value: image ?? "", // Image URL (or empty string)
            label: name,        // RenderName
          };
        })
        .filter((x): x is { value: string; label: string } => x !== null);

      return withCors(
        NextResponse.json({ options }, { status: 200, headers: { "Cache-Control": "no-store" } })
      );
    }

    // ---------- windowSelection ----------
    if (output === "windowselection") {
      const renderName = searchParams.get("renderName");

      // If a specific renderName is provided, return that item's WindowParts
      if (renderName) {
        const match = items.find((v) => (v?.data?.RenderName ?? "") === renderName);
        const parts = Array.isArray(match?.data?.WindowParts) ? match?.data?.WindowParts : [];
        // Return 200 with [] even if not found (keeps dropdown happy)
        return withCors(
          NextResponse.json(
            { multi_select_options: parts },
            { status: 200, headers: { "Cache-Control": "no-store" } }
          )
        );
      }

      // Otherwise, fall back to the field's declared multi_select_options
      const field = fields.find((f) => f?.name === "WindowParts" && f?.type === "multi_select");
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
      NextResponse.json(col, { status: 200, headers: { "Cache-Control": "no-store" } })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Duda API Error:", err);
    return withCors(
      NextResponse.json({ error: "Duda API request failed", details: message }, { status: 500 })
    );
  }
}
