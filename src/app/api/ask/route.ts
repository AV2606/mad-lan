import { ask } from "@/lib/ask";

// worst case is two model calls (parse + narrate) at 10s each
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
  const url = new URL(request.url).searchParams;
  const result = await ask({
    question: body.question,
    plan: body.plan,
    simulate: body.simulate ?? url.get("simulate"),
    simulateStage: body.simulateStage ?? url.get("stage"),
  });
  return Response.json(result, { status: result.ok ? 200 : result.status });
}
