/** One JSON line per stage on stdout, so Vercel logs are searchable by receipt code (`rid`). Never log keys or full questions. */
export function log(rid: string, stage: string, fields: Record<string, unknown> = {}, level: "info" | "error" = "info") {
  const line = JSON.stringify({ rid, stage, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const clip = (s: string, max = 200) => (s.length > max ? s.slice(0, max) + "…" : s);
