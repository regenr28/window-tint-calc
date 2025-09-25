import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ---- Minimal shapes from Duda ---- */
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

function withCors(resp: NextResponse) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 200 }));
}

/** Shared fetch to Duda Collections */
async function fetchCollection(site_name: string, collection_name: string) {
  const uname = process.env.DUDA_API_USERNAME;
  const pass = process.env.DUDA_API_PASSWORD;
  if (!uname || !pass) throw new Error("Missing Duda credentials");

  const { Duda } = await import("@dudadev/partner-api");
  const duda = new Duda({ user: uname, pass });

  const raw = await duda.collections.get({ site_name, collection_name });
  const col = raw as unknown as CollectionResponse;
  const items: CollectionItem[] = Array.isArray(col.values) ? col.values : [];
  const fields: CollectionField[] = Array.isArray(col.fields) ? col.fields : [];
  return { col, items, fields };
}

/** ----------------------
 *  POST  (Duda Dynamic Dropdown)
 *  ---------------------- */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const qp_site = url.searchParams.get("site_name");
    const qp_collection = url.searchParams.get("collection_name");
    const qp_output = (url.searchParams.get("output") || "carselection").toLowerCase();

    // Duda body: { site: { site_name, ... }, widget: { variables: [...] } }
    const body = await request.json().catch(() => ({} as any));
    const bodySiteName: string | undefined = body?.site?.site_name;

    const site_name = bodySiteName || qp_site; // prefer body.site.site_name
    const collection_name = qp_collection || "WindowTintRenders";

    if (!site_name || !collection_name) {
      return withCors(
        NextResponse.json(
          { error: "Missing site_name and/or collection_name" },
          { status: 400 }
        )
      );
    }

    const { items } = await fetchCollection(site_name, collection_name);

    // Default for Dynamic Dropdown → car selection
    if (qp_output === "carselection") {
      const options = items
        .map((it) => it?.data ?? {})
        .filter((d) => typeof d.RenderName === "string" && d.RenderName.trim().length)
        .map((d: any) => ({
          // You can switch value to d.Image if you prefer image URL:
          // value: String(d.Image ?? d.RenderName),
          value: String(d.RenderName),
          label: String(d.RenderName),
        }));

      return withCors(
        NextResponse.json({ options }, { status: 200 })
      );
    }

    // Fallback: still return empty options array to satisfy Duda schema
    return withCors(NextResponse.json({ options: [] }, { status: 200 }));
  } catch (err: any) {
    console.error("POST error:", err);
    return withCors(
      NextResponse.json({ error: "Request failed", details: err?.message ?? String(err) }, { status: 500 })
    );
  }
}

/** ----------------------
 *  GET  (manual testing / other outputs)
 *  ---------------------- */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const site_name = searchParams.get("site_name");
    const collection_name = searchParams.get("collection_name");
    const output = (searchParams.get("output") || "general").toLowerCase();
    const renderName = searchParams.get("renderName");

    if (!site_name || !collection_name) {
      return withCors(
        NextResponse.json(
          { error: "Missing required parameters: site_name and collection_name" },
          { status: 400 }
        )
      );
    }

    const { col, items, fields } = await fetchCollection(site_name, collection_name);

    // GET carselection → convenient manual check in browser
    if (output === "carselection") {
      const options = items
        .map((it) => it?.data ?? {})
        .filter((d) => typeof d.RenderName === "string" && d.RenderName.trim().length)
        .map((d: any) => ({
          value: String(d.RenderName),
          label: String(d.RenderName),
        }));
      return withCors(NextResponse.json({ options }, { status: 200 }));
    }

    // windowselection (GET) – keep as before
    if (output === "windowselection") {
      if (renderName) {
        const match = items.find((v) => (v?.data?.RenderName ?? "") === renderName);
        const parts = Array.isArray(match?.data?.WindowParts) ? match?.data?.WindowParts : [];
        return withCors(NextResponse.json({ multi_select_options: parts }, { status: 200 }));
      }
      const field = fields.find((f) => f?.name === "WindowParts" && f?.type === "multi_select");
      if (!field || !Array.isArray(field.multi_select_options)) {
        return withCors(NextResponse.json({ error: "WindowParts field not found" }, { status: 404 }));
      }
      return withCors(NextResponse.json({ multi_select_options: field.multi_select_options }, { status: 200 }));
    }

    // default: raw collection (debug)
    return withCors(NextResponse.json(col, { status: 200 }));
  } catch (err: any) {
    console.error("GET error:", err);
    return withCors(
      NextResponse.json({ error: "Duda API request failed", details: err?.message ?? String(err) }, { status: 500 })
    );
  }
}
