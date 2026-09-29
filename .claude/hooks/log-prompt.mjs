// UserPromptSubmit hook: appends every prompt sent to the AI assistant to docs/AI_PROMPTS_LOG.md.
// Never blocks the prompt: any failure is swallowed and the hook exits 0.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const prompt = (input.prompt ?? "").trim();
  if (prompt) {
    const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const dir = join(root, "docs");
    const file = join(dir, "AI_PROMPTS_LOG.md");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(file)) {
      appendFileSync(file, "# AI prompts log (raw, auto-appended)\n\nEvery prompt sent to the AI assistant, appended by `.claude/hooks/log-prompt.mjs`.\nThe curated story (what worked, what went wrong) is in [AI_LOG.md](AI_LOG.md).\n");
    }
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    const session = (input.session_id ?? "unknown").slice(0, 8);
    const quoted = prompt.split(/\r?\n/).map((l) => `> ${l}`).join("\n");
    appendFileSync(file, `\n---\n\n### ${ts} UTC · session \`${session}\`\n\n${quoted}\n`);
  }
} catch {
  // logging must never break the session
}
process.exit(0);
