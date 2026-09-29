import { describe, expect, it } from "vitest";
import { CITIES, LlmPlanSchema, NEIGHBORHOODS, PLAN_JSON_SCHEMA, QueryPlanSchema, sanitizePlan } from "../src/lib/plan";
import type { LlmPlan } from "../src/lib/plan";

const plan = (o: Record<string, unknown> = {}) => ({
  intent: "estimate",
  areas: [{ city: "גבעתיים", neighborhood: null }],
  propertyType: "דירה",
  rooms: 4,
  sizeSqm: 100,
  askingPriceNis: 4_200_000,
  unsupportedReason: null,
  mentionedPlace: null,
  clarifyQuestion: null,
  ...o,
});

describe("QueryPlanSchema", () => {
  it("accepts a valid plan", () => expect(QueryPlanSchema.safeParse(plan()).success).toBe(true));

  it("rejects an unknown city", () => {
    expect(QueryPlanSchema.safeParse(plan({ areas: [{ city: "אילת", neighborhood: null }] })).success).toBe(false);
  });

  it("rejects 3 areas, and compare without exactly 2", () => {
    const a = { city: "חיפה", neighborhood: null };
    expect(QueryPlanSchema.safeParse(plan({ intent: "compare", areas: [a, a, a] })).success).toBe(false);
    expect(QueryPlanSchema.safeParse(plan({ intent: "compare", areas: [a] })).success).toBe(false);
    expect(QueryPlanSchema.safeParse(plan({ intent: "compare", areas: [a, { city: "חולון", neighborhood: null }] })).success).toBe(true);
  });

  it("rejects out-of-range rooms, size and asking price", () => {
    expect(QueryPlanSchema.safeParse(plan({ rooms: 40 })).success).toBe(false);
    expect(QueryPlanSchema.safeParse(plan({ sizeSqm: 5 })).success).toBe(false);
    expect(QueryPlanSchema.safeParse(plan({ askingPriceNis: 1 })).success).toBe(false);
  });

  it("rejects a neighborhood that isn't in that city", () => {
    expect(QueryPlanSchema.safeParse(plan({ areas: [{ city: "חיפה", neighborhood: "פלורנטין" }] })).success).toBe(false);
    expect(QueryPlanSchema.safeParse(plan({ areas: [{ city: "תל אביב-יפו", neighborhood: "פלורנטין" }] })).success).toBe(true);
  });

  it("rejects unknown keys (nothing rides along in a plan)", () => {
    expect(QueryPlanSchema.safeParse({ ...plan(), extra: 1 }).success).toBe(false);
  });
});

describe("data-derived lists", () => {
  it("cities are the 18 canonical ones with no variants", () => {
    expect(CITIES).toHaveLength(18);
    expect(CITIES).toContain("תל אביב-יפו");
    expect(CITIES).not.toContain("Jerusalem");
  });
  it("neighborhoods include the merged aliases", () => {
    expect(NEIGHBORHOODS["תל אביב-יפו"]).toContain("פלורנטין");
    expect(NEIGHBORHOODS["בית שמש"]).toContain("רמת בית שמש ג'");
  });
});

describe("Groq strict-mode JSON schema contract", () => {
  const check = (node: Record<string, unknown>, path: string) => {
    if (node.type === "object" || (Array.isArray(node.type) && node.type.includes("object"))) {
      expect(node.additionalProperties, `${path} additionalProperties`).toBe(false);
      const props = Object.keys(node.properties as object);
      expect([...(node.required as string[])].sort(), `${path} required`).toEqual(props.sort());
      for (const [k, v] of Object.entries(node.properties as Record<string, Record<string, unknown>>)) check(v, `${path}.${k}`);
    }
    if (node.type === "array") check(node.items as Record<string, unknown>, `${path}[]`);
  };
  it("every object has additionalProperties:false and lists all its keys as required", () => {
    check(PLAN_JSON_SCHEMA as unknown as Record<string, unknown>, "plan");
  });
  it("the city is an enum of the canonical cities, so the model can't invent one", () => {
    expect(PLAN_JSON_SCHEMA.properties.areas.items.properties.city.enum).toEqual(CITIES);
  });
  it("has exactly the keys the Zod schema has", () => {
    expect(Object.keys(PLAN_JSON_SCHEMA.properties).sort()).toEqual(Object.keys(LlmPlanSchema.shape).sort());
  });
});

describe("sanitizePlan", () => {
  const llm = (o: Record<string, unknown> = {}) => plan(o) as unknown as LlmPlan;

  it("passes a good plan through unchanged, with no notes", () => {
    const r = sanitizePlan(llm());
    expect(r.plan).toEqual(plan());
    expect(r.notes).toEqual([]);
  });

  it("drops a neighborhood that isn't in the city and says so", () => {
    const r = sanitizePlan(llm({ areas: [{ city: "חיפה", neighborhood: "פלורנטין" }] }));
    expect(r.plan.areas).toEqual([{ city: "חיפה", neighborhood: null }]);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toContain("פלורנטין");
  });

  it("nulls out-of-range values with a note each", () => {
    const r = sanitizePlan(llm({ rooms: 40, sizeSqm: 3, askingPriceNis: 5 }));
    expect(r.plan).toMatchObject({ rooms: null, sizeSqm: null, askingPriceNis: null });
    expect(r.notes).toHaveLength(3);
  });

  it("compare with 1 or 3 areas becomes clarify; estimate with 0 areas becomes clarify", () => {
    const a = { city: "חיפה", neighborhood: null };
    for (const o of [{ intent: "compare", areas: [a] }, { intent: "compare", areas: [a, a, a] }, { intent: "estimate", areas: [] }]) {
      const r = sanitizePlan(llm(o));
      expect(r.plan.intent).toBe("clarify");
      expect(r.plan.clarifyQuestion).toBeTruthy();
    }
  });

  it("fills defaults for unsupported / clarify, and the result always passes the strict schema", () => {
    for (const o of [
      { intent: "unsupported", areas: [], unsupportedReason: null },
      { intent: "clarify", areas: [], clarifyQuestion: null },
      { intent: "compare", areas: [{ city: "חיפה", neighborhood: null }, { city: "חולון", neighborhood: "נאות רחל" }, { city: "חיפה", neighborhood: null }] },
      { rooms: 99, areas: [{ city: "חיפה", neighborhood: "לא קיימת" }] },
    ]) {
      expect(QueryPlanSchema.safeParse(sanitizePlan(llm(o)).plan).success).toBe(true);
    }
  });
});
