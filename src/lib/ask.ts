import rawDeals from "../data/deals.json";
import { CITY_ALIASES } from "./clean";
import { MIN_DEALS, compareAreas, findComps, latestDealDate } from "./comps";
import type { CompareResult, CompsQuery, CompsResult } from "./comps";
import { compareFacts, estimateFacts } from "./facts";
import type { Facts } from "./facts";
import { callGroq, isSimulate } from "./groq";
import type { FailureKind, Simulate } from "./groq";
import { clip, log } from "./log";
import { checkNumbers, latinLeaks } from "./numberGuard";
import { LlmPlanSchema, PLAN_JSON_SCHEMA, QueryPlanSchema, sanitizePlan } from "./plan";
import type { QueryPlan } from "./plan";
import { buildNarrateMessages, buildParseMessages } from "./prompts";
import { DATASET_VERSION, codeForText, encodeReceipt } from "./receipt";
import { FAILURE_MESSAGE_HE, INTERNAL_ERROR_HE, narrationTemplate, unsupportedMessage } from "./templates";
import type { Deal } from "./types";
import { z } from "zod";

const DEALS = rawDeals as unknown as Deal[];
const AS_OF = latestDealDate(DEALS);

export const MAX_QUESTION_CHARS = 500;

const NarrationSchema = z.object({ text: z.string().min(1).max(1500) });
const NARRATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: { text: { type: "string" } },
} as const;
/** What `?simulate=hallucinate` makes the "model" say: fluent, plausible, and invented. */
const HALLUCINATION = JSON.stringify({ text: "לפי הנתונים המחיר הוא כ-7,777,777 ₪ למ״ר, ולכן הדירה שווה הרבה יותר." });
const FORBIDDEN_WORDS = ["הוגן", "שווי"];

export type StageRecord = {
  stage: "parse" | "comps" | "narrate" | "investigate";
  ok: boolean;
  latencyMs?: number;
  kind?: FailureKind;
  detail?: string;
  model?: string;
  raw?: string;
  [extra: string]: unknown;
};

export type AskResponse =
  | {
      ok: true;
      rid: string;
      receipt: { code: string; token: string } | null;
      plan: QueryPlan | null;
      planNotes: string[];
      outcome: "answer" | "unsupported" | "clarify" | "parse_failed";
      /** Hebrew text shown above the answer: a failure notice, the unsupported reason, or the clarifying question */
      message: string | null;
      failure: FailureKind | null;
      showManualForm: boolean;
      prefill: { city: string } | null;
      answer:
        | { kind: "single"; query: CompsQuery; comps: CompsResult }
        | { kind: "compare"; queries: [CompsQuery, CompsQuery]; compare: CompareResult }
        | null;
      facts: Facts | null;
      narration: { text: string; source: "llm" | "template" } | null;
      debug: { stages: StageRecord[]; datasetVersion: string; simulate: Simulate | null; question: string | null };
    }
  | { ok: false; status: number; error: string };

/** `simulateStage` limits a simulated failure to one model call, so "parse works, narration fails" can be demoed. */
export type AskInput = { question?: unknown; plan?: unknown; simulate?: unknown; simulateStage?: unknown };

const cityGuess = (text: string): string | null => {
  const names = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  const hit = names.find((n) => text.includes(n));
  return hit ? CITY_ALIASES[hit] : null;
};

function queriesFor(plan: QueryPlan): CompsQuery[] {
  const base = { propertyType: plan.propertyType, rooms: plan.rooms };
  if (plan.intent === "compare") {
    return plan.areas.map((a) => ({ ...base, city: a.city, neighborhood: a.neighborhood, sizeSqm: null, askingPriceNis: null }));
  }
  const [a] = plan.areas;
  return [{ ...base, city: a.city, neighborhood: a.neighborhood, sizeSqm: plan.sizeSqm, askingPriceNis: plan.askingPriceNis }];
}

export async function ask(input: AskInput): Promise<AskResponse> {
  const simulate: Simulate | null = isSimulate(input.simulate) ? input.simulate : null;
  const parseSim = input.simulateStage === "narrate" ? null : simulate;
  const narrateSim = input.simulateStage === "parse" ? null : simulate;
  const stages: StageRecord[] = [];
  let rid = codeForText(`${Date.now()}-${Math.random()}`);

  try {
    let plan: QueryPlan;
    let planNotes: string[] = [];
    let question: string | null = null;
    const viaModel = input.plan === undefined;

    if (!viaModel) {
      // A plan from the manual form or a receipt link: validated like any outside input, and no model is involved.
      const parsed = QueryPlanSchema.safeParse(input.plan);
      if (!parsed.success) return { ok: false, status: 400, error: "התוכנית שנשלחה לא תקינה." };
      plan = parsed.data;
    } else {
      if (typeof input.question !== "string" || input.question.trim() === "") {
        return { ok: false, status: 400, error: "כתבו שאלה כדי שנוכל לבדוק." };
      }
      question = input.question.trim();
      if (question.length > MAX_QUESTION_CHARS) {
        return { ok: false, status: 400, error: `השאלה ארוכה מדי. אפשר עד ${MAX_QUESTION_CHARS} תווים.` };
      }
      rid = codeForText(question);

      const parse = await callGroq({
        messages: buildParseMessages(question),
        schema: { name: "query_plan", schema: PLAN_JSON_SCHEMA },
        zod: LlmPlanSchema,
        simulate: parseSim,
      });
      if (!parse.ok) {
        stages.push({ stage: "parse", ok: false, latencyMs: parse.latencyMs, kind: parse.kind, detail: parse.detail, raw: parse.raw });
        const guess = cityGuess(question);
        return finish(rid, stages, {
          ok: true, rid, receipt: null, plan: null, planNotes: [], outcome: "parse_failed",
          message: FAILURE_MESSAGE_HE[parse.kind], failure: parse.kind, showManualForm: true,
          prefill: guess ? { city: guess } : null, answer: null, facts: null, narration: null,
          debug: { stages, datasetVersion: DATASET_VERSION, simulate, question: clip(question) },
        });
      }
      const sanitized = sanitizePlan(parse.data);
      plan = sanitized.plan;
      planNotes = sanitized.notes;
      stages.push({ stage: "parse", ok: true, latencyMs: parse.latencyMs, model: parse.model, intent: plan.intent, raw: clip(parse.raw, 600) });
    }

    const receipt = encodeReceipt(plan);
    rid = receipt.code;
    const debug = { stages, datasetVersion: DATASET_VERSION, simulate, question: question === null ? null : clip(question) };
    const base = { ok: true as const, rid, receipt: { code: receipt.code, token: receipt.token }, plan, planNotes, debug, prefill: null };

    if (plan.intent === "unsupported") {
      return finish(rid, stages, {
        ...base, outcome: "unsupported", message: unsupportedMessage(plan.unsupportedReason, plan.mentionedPlace),
        failure: null, showManualForm: false, answer: null, facts: null, narration: null,
      });
    }
    if (plan.intent === "clarify") {
      return finish(rid, stages, {
        ...base, outcome: "clarify", message: plan.clarifyQuestion, failure: null, showManualForm: true,
        answer: null, facts: null, narration: null,
      });
    }

    // ---- numbers: deterministic, no model ----
    const t0 = Date.now();
    const queries = queriesFor(plan);
    let answer: NonNullable<Extract<AskResponse, { ok: true }>["answer"]>;
    let facts: Facts;
    if (plan.intent === "compare") {
      const compare = compareAreas(DEALS, queries[0], queries[1], AS_OF);
      answer = { kind: "compare", queries: [queries[0], queries[1]], compare };
      facts = compareFacts(queries[0], queries[1], compare, MIN_DEALS);
      stages.push({ stage: "comps", ok: true, latencyMs: Date.now() - t0, ratio: compare.ratio, levels: compare.areas.map((a) => a.level) });
    } else {
      const comps = findComps(DEALS, queries[0], AS_OF);
      answer = { kind: "single", query: queries[0], comps };
      facts = estimateFacts(queries[0], comps, MIN_DEALS);
      stages.push({
        stage: "comps", ok: true, latencyMs: Date.now() - t0, level: comps.level, n: comps.stats?.n ?? comps.deals.length,
        status: comps.status, confidence: comps.confidence.level,
      });
    }

    // ---- explanation: model text if it passes the guard, otherwise the template ----
    const template = narrationTemplate(facts);
    let narration: { text: string; source: "llm" | "template" } = { text: template, source: "template" };
    let failure: FailureKind | null = null;
    if (viaModel) {
      const res = await callGroq({
        messages: buildNarrateMessages(facts),
        schema: { name: "narration", schema: NARRATION_JSON_SCHEMA },
        zod: NarrationSchema,
        simulate: narrateSim,
        hallucination: HALLUCINATION,
      });
      if (!res.ok) {
        failure = res.kind;
        stages.push({ stage: "narrate", ok: false, latencyMs: res.latencyMs, kind: res.kind, detail: res.detail, raw: res.raw });
      } else {
        const guard = checkNumbers(res.data.text, facts);
        const forbidden = [...FORBIDDEN_WORDS.filter((w) => res.data.text.includes(w)), ...latinLeaks(res.data.text)];
        if (guard.ok && forbidden.length === 0) {
          narration = { text: res.data.text, source: "llm" };
          stages.push({ stage: "narrate", ok: true, latencyMs: res.latencyMs, model: res.model, raw: clip(res.raw, 600) });
        } else {
          failure = "guard_rejected";
          stages.push({
            stage: "narrate", ok: false, latencyMs: res.latencyMs, kind: "guard_rejected", model: res.model,
            badNumbers: guard.ok ? [] : guard.badNumbers, forbiddenWords: forbidden, raw: clip(res.raw, 600),
          });
        }
      }
    }

    return finish(rid, stages, {
      ...base, outcome: "answer", message: failure ? FAILURE_MESSAGE_HE[failure] || null : null, failure,
      showManualForm: false, answer, facts, narration,
    });
  } catch (e) {
    log(rid, "internal_error", { message: (e as Error).message, stack: (e as Error).stack }, "error");
    return { ok: false, status: 500, error: INTERNAL_ERROR_HE(rid) };
  }
}

/** One log line per stage, all under the same receipt code. The raw model output stays out of the logs. */
export function logStages(rid: string, stages: StageRecord[]) {
  for (const { stage, raw, ...fields } of stages) {
    void raw;
    log(rid, stage, fields, fields.kind === "config" ? "error" : "info");
  }
}

function finish(rid: string, stages: StageRecord[], response: AskResponse): AskResponse {
  logStages(rid, stages);
  return response;
}
