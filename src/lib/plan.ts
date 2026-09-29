import { z } from "zod";
import places from "../data/places.json";
import { PROPERTY_TYPES } from "./types";

// ---------- what the data knows about ----------

/** city → neighborhoods, generated from the cleaned deals (npm run data) so it can never drift from the data. */
export const NEIGHBORHOODS: Record<string, string[]> = places;
export const CITIES = Object.keys(NEIGHBORHOODS);

// ---------- limits ----------

export const LIMITS = {
  rooms: { min: 1, max: 8 },
  sizeSqm: { min: 15, max: 400 },
  askingPriceNis: { min: 300_000, max: 60_000_000 },
};

export const INTENTS = ["estimate", "area_stats", "compare", "unsupported", "clarify"] as const;
export const UNSUPPORTED_REASONS = ["rent", "forecast", "mortgage_or_legal", "place_not_in_data", "other"] as const;

// ---------- Zod ----------

const cityEnum = z.enum(CITIES as [string, ...string[]]);

const areaSchema = z.object({ city: cityEnum, neighborhood: z.string().nullable() });

const planShape = {
  intent: z.enum(INTENTS),
  areas: z.array(z.object({ city: z.string(), neighborhood: z.string().nullable() })),
  propertyType: z.enum(PROPERTY_TYPES).nullable(),
  rooms: z.number().nullable(),
  sizeSqm: z.number().nullable(),
  askingPriceNis: z.number().nullable(),
  unsupportedReason: z.enum(UNSUPPORTED_REASONS).nullable(),
  mentionedPlace: z.string().nullable(),
  clarifyQuestion: z.string().nullable(),
};

/** What the model is allowed to return: right shape, but ranges and area counts are judged by `sanitizePlan`. */
export const LlmPlanSchema = z.object(planShape).strict();
export type LlmPlan = z.infer<typeof LlmPlanSchema>;

const inRange = (v: number | null, r: { min: number; max: number }) => v === null || (v >= r.min && v <= r.max);

/** A plan that is safe to run: used for anything that arrives from outside (manual form, receipt link) and after sanitizing. */
export const QueryPlanSchema = z
  .object({ ...planShape, areas: z.array(areaSchema).max(2) })
  .strict()
  .superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if ((p.intent === "estimate" || p.intent === "area_stats") && p.areas.length !== 1) fail("expected exactly 1 area");
    if (p.intent === "compare" && p.areas.length !== 2) fail("compare needs exactly 2 areas");
    if (!inRange(p.rooms, LIMITS.rooms)) fail("rooms out of range");
    if (!inRange(p.sizeSqm, LIMITS.sizeSqm)) fail("sizeSqm out of range");
    if (!inRange(p.askingPriceNis, LIMITS.askingPriceNis)) fail("askingPriceNis out of range");
    for (const a of p.areas) {
      if (a.neighborhood !== null && !NEIGHBORHOODS[a.city]?.includes(a.neighborhood)) {
        fail(`neighborhood "${a.neighborhood}" is not in ${a.city}`);
      }
    }
  });
export type QueryPlan = z.infer<typeof QueryPlanSchema>;

// ---------- JSON schema for Groq strict mode ----------
// Strict mode: every key required, additionalProperties false, nullable via type arrays.
// Written by hand (not generated) so the exact contract is visible; tests/plan.test.ts checks it.

export const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(planShape),
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    areas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["city", "neighborhood"],
        properties: {
          city: { type: "string", enum: CITIES },
          neighborhood: { type: ["string", "null"] },
        },
      },
    },
    propertyType: { type: ["string", "null"], enum: [...PROPERTY_TYPES, null] },
    rooms: { type: ["number", "null"] },
    sizeSqm: { type: ["number", "null"] },
    askingPriceNis: { type: ["number", "null"] },
    unsupportedReason: { type: ["string", "null"], enum: [...UNSUPPORTED_REASONS, null] },
    mentionedPlace: { type: ["string", "null"] },
    clarifyQuestion: { type: ["string", "null"] },
  },
} as const;

// ---------- sanitizing the model's plan (code, after Zod) ----------

const DEFAULT_CLARIFY = "על איזה אזור לחפש? למשל עיר או שכונה.";

/**
 * Turns the model's plan into one that passes `QueryPlanSchema`, recording every change as a Hebrew note
 * so nothing is silently dropped. The model's city is trusted only because it is an enum in the schema.
 */
export function sanitizePlan(raw: LlmPlan): { plan: QueryPlan; notes: string[] } {
  const notes: string[] = [];
  const knownCities = new Set(CITIES);
  const areas = raw.areas
    .filter((a) => knownCities.has(a.city))
    .map((a) => {
      if (a.neighborhood !== null && !NEIGHBORHOODS[a.city].includes(a.neighborhood)) {
        notes.push(`השכונה ${a.neighborhood} לא נמצאה בנתונים של ${a.city}, מציגים את כל העיר.`);
        return { city: a.city, neighborhood: null };
      }
      return { city: a.city, neighborhood: a.neighborhood };
    });

  const limited = (v: number | null, r: { min: number; max: number }, label: string) => {
    if (inRange(v, r)) return v;
    notes.push(`התעלמנו מ${label} (${v}) כי הוא מחוץ לטווח הסביר.`);
    return null;
  };

  const plan: QueryPlan = {
    intent: raw.intent,
    areas,
    propertyType: raw.propertyType,
    rooms: limited(raw.rooms, LIMITS.rooms, "מספר החדרים"),
    sizeSqm: limited(raw.sizeSqm, LIMITS.sizeSqm, "השטח"),
    askingPriceNis: limited(raw.askingPriceNis, LIMITS.askingPriceNis, "המחיר"),
    unsupportedReason: raw.unsupportedReason,
    mentionedPlace: raw.mentionedPlace,
    clarifyQuestion: raw.clarifyQuestion,
  };

  const wanted = raw.intent === "compare" ? 2 : raw.intent === "estimate" || raw.intent === "area_stats" ? 1 : null;
  if (wanted !== null && areas.length !== wanted) {
    return {
      plan: { ...plan, intent: "clarify", areas: [], clarifyQuestion: raw.clarifyQuestion ?? DEFAULT_CLARIFY },
      notes,
    };
  }
  if (plan.intent === "unsupported" && plan.unsupportedReason === null) plan.unsupportedReason = "other";
  if (plan.intent === "clarify" && plan.clarifyQuestion === null) plan.clarifyQuestion = DEFAULT_CLARIFY;
  plan.areas = plan.areas.slice(0, 2);
  return { plan, notes };
}
