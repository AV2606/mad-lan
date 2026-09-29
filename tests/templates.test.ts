import { describe, expect, it } from "vitest";
import rawDeals from "../src/data/deals.json";
import { MIN_DEALS, compareAreas, findComps, latestDealDate } from "../src/lib/comps";
import type { CompsQuery } from "../src/lib/comps";
import { compareFacts, estimateFacts } from "../src/lib/facts";
import { checkNumbers } from "../src/lib/numberGuard";
import { CITIES, NEIGHBORHOODS } from "../src/lib/plan";
import { FAILURE_MESSAGE_HE, narrationTemplate, unsupportedMessage } from "../src/lib/templates";
import type { Deal } from "../src/lib/types";

const DEALS = rawDeals as unknown as Deal[];
const AS_OF = latestDealDate(DEALS);
const q = (o: Partial<CompsQuery>): CompsQuery => ({
  city: "גבעתיים", neighborhood: null, propertyType: null, rooms: null, sizeSqm: null, askingPriceNis: null, ...o,
});

describe("templates", () => {
  it("every city and neighborhood produces non-empty Hebrew whose numbers all pass the guard against its own facts", () => {
    let checked = 0;
    for (const city of CITIES) {
      for (const hood of [null, ...NEIGHBORHOODS[city]]) {
        for (const extra of [{}, { rooms: 4, sizeSqm: 100, askingPriceNis: 4_200_000, propertyType: "דירה" as const }]) {
          const query = q({ city, neighborhood: hood, ...extra });
          const facts = estimateFacts(query, findComps(DEALS, query, AS_OF), MIN_DEALS);
          const text = narrationTemplate(facts);
          expect(text.length, `${city}/${hood}`).toBeGreaterThan(30);
          expect(text).toMatch(/[א-ת]/);
          expect(checkNumbers(text, facts), `${city}/${hood}: ${text}`).toEqual({ ok: true });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("compare templates pass the guard too, for ok/ok, ok/insufficient and insufficient/insufficient", () => {
    const pairs: [string, string][] = [["רעננה", "כפר סבא"], ["רעננה", "אשדוד"], ["ירושלים", "חיפה"]];
    for (const [a, b] of pairs) {
      const qa = q({ city: a });
      const qb = q({ city: b, neighborhood: NEIGHBORHOODS[b][0], rooms: 6 });
      const facts = compareFacts(qa, qb, compareAreas(DEALS, qa, qb, AS_OF), MIN_DEALS);
      const text = narrationTemplate(facts);
      expect(text.length).toBeGreaterThan(30);
      expect(checkNumbers(text, facts)).toEqual({ ok: true });
    }
  });

  it("an insufficient result says so and shows no price", () => {
    // a house with 6 rooms in Rishon: only 4 deals match even after every widening step
    const query = q({ city: "ראשון לציון", propertyType: "בית פרטי", rooms: 6, sizeSqm: 200 });
    const r = findComps(DEALS, query, AS_OF);
    expect(r.status).toBe("insufficient");
    const text = narrationTemplate(estimateFacts(query, r, MIN_DEALS));
    expect(text).toContain("לא מצאנו מספיק");
    expect(text).not.toMatch(/למ״ר, ורוב/);
  });

  it("templates never use the forbidden words", () => {
    const query = q({ city: "גבעתיים", rooms: 4, sizeSqm: 100, askingPriceNis: 4_200_000 });
    const text = narrationTemplate(estimateFacts(query, findComps(DEALS, query, AS_OF), MIN_DEALS));
    expect(text).not.toMatch(/הוגן|שווי/);
  });

  it("every failure kind has a Hebrew message (guard_rejected is intentionally silent)", () => {
    for (const [kind, msg] of Object.entries(FAILURE_MESSAGE_HE)) {
      if (kind === "guard_rejected") expect(msg).toBe("");
      else expect(msg).toMatch(/[א-ת]/);
    }
  });

  it("every unsupported reason has a message; place_not_in_data names the place and the available cities", () => {
    for (const r of ["rent", "forecast", "mortgage_or_legal", "place_not_in_data", "other", null] as const) {
      expect(unsupportedMessage(r, "אילת").length).toBeGreaterThan(20);
    }
    const m = unsupportedMessage("place_not_in_data", "אילת");
    expect(m).toContain("אילת");
    expect(m).toContain("חיפה");
  });
});
