import { investigate } from "@/lib/investigate";

export const maxDuration = 30;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "הבקשה לא תקינה." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ ok: false, error: "הבקשה לא תקינה." }, { status: 400 });
  }
  try {
    const result = await investigate({
      receipt: body.receipt,
      complaint: body.complaint,
      simulate: body.simulate ?? new URL(request.url).searchParams.get("simulate"),
    });
    return Response.json(result, { status: result.ok ? 200 : result.status });
  } catch (e) {
    console.error(JSON.stringify({ stage: "investigate_internal_error", message: (e as Error).message, stack: (e as Error).stack }));
    return Response.json({ ok: false, error: "משהו השתבש אצלנו. נסו שוב, ואם זה חוזר, פנו ל-R&D עם הקישור." }, { status: 500 });
  }
}
