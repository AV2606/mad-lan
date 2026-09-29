import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPlaces, buildReport, clean, normalizeCity, normalizeNeighborhood, serializeDeals } from "../src/lib/clean";
import { parseCsv } from "../src/lib/csv";
import type { Deal } from "../src/lib/types";

const rows = parseCsv(readFileSync("data/madlan_deals_sample.csv", "utf8"));
const { deals, report } = clean(rows);
const rowsOf = (id: string) => deals.filter((d) => d.id === id);
const winner = (id: string) => rowsOf(id).find((d) => d.status === "ok") as Deal;
const loser = (id: string) => rowsOf(id).find((d) => d.status === "excluded") as Deal;

describe("aliases", () => {
  it.each([
    ["ירושלים ", "ירושלים"],
    ["Jerusalem", "ירושלים"],
    ["תל אביב", "תל אביב-יפו"],
    ["תל אביב יפו", "תל אביב-יפו"],
    ["Tel Aviv-Yafo", "תל אביב-יפו"],
    ['ת"א', "תל אביב-יפו"],
    ["באר-שבע", "באר שבע"],
    ['ב"ש', "באר שבע"],
    ["בית-שמש", "בית שמש"],
    ["מודיעין", "מודיעין-מכבים-רעות"],
    ["מודיעין מכבים רעות", "מודיעין-מכבים-רעות"],
  ])("city %s → %s", (raw, expected) => expect(normalizeCity(raw)).toBe(expected));

  it("unknown city throws", () => expect(() => normalizeCity("אילת")).toThrow(/Unknown city/));

  it("neighborhood aliases", () => {
    expect(normalizeNeighborhood("Florentin")).toBe("פלורנטין");
    expect(normalizeNeighborhood('רמב"ש ג\'')).toBe("רמת בית שמש ג'");
    expect(normalizeNeighborhood("רמת בית שמש א")).toBe("רמת בית שמש א'");
    expect(normalizeNeighborhood("  נאות שקד ")).toBe("נאות שקד");
    expect(normalizeNeighborhood("")).toBeNull();
  });

  it("does not merge מרכז with מרכז העיר (DILEMMAS #18)", () => {
    expect(normalizeNeighborhood("מרכז")).not.toBe(normalizeNeighborhood("מרכז העיר"));
  });

  it("every city in the output is canonical (no variants left)", () => {
    const cities = report.cities.map((c) => c.city);
    expect(cities).toHaveLength(18);
    expect(cities).not.toContain("Jerusalem");
    expect(cities.filter((c) => c.startsWith("מודיעין"))).toEqual(["מודיעין-מכבים-רעות"]);
  });

  it("no neighborhood variant is left over from the aliases", () => {
    const names = new Set(deals.map((d) => d.neighborhood));
    for (const bad of ["רמת בית שמש א", "רמת בית שמש ג", "Florentin", 'רמב"ש ג\'', 'רמב"ש א\'']) {
      expect(names.has(bad)).toBe(false);
    }
  });
});

describe("duplicates", () => {
  it.each(["D100196", "D100311", "D100099", "D100416", "D100215", "D100025"])("%s: exact duplicate keeps one row", (id) => {
    expect(rowsOf(id)).toHaveLength(2);
    expect(rowsOf(id).filter((d) => d.status === "ok")).toHaveLength(1);
    expect(loser(id).flags).toContain("exact_duplicate");
  });

  it.each([
    ["D100124", 5727000, "רשות המסים", 5429440],
    ["D100017", 1919000, "רשות המסים", 1851548],
    ["D100032", 5141000, "בעל נכס", 5343137],
    ["D100303", 6064000, "בעל נכס", 6195332],
  ])("%s: keeps %i (%s), excludes the broker's %i", (id, price, source, brokerPrice) => {
    const w = winner(id);
    const l = loser(id);
    expect(w.priceNis).toBe(price);
    expect(w.source).toBe(source);
    expect(l.priceNis).toBe(brokerPrice);
    expect(l.source).toBe("מתווך");
    expect(l.flags).toContain("conflicting_duplicate");
    expect(l.keptPriceNis).toBe(price);
    // the source-priority rule and the price_per_sqm consistency check must agree
    expect(w.flags).not.toContain("ppsqm_mismatch");
    expect(l.flags).toContain("ppsqm_mismatch");
  });

  it("D100124: the broker row comes first in the file and still loses (no 'keep first')", () => {
    const order = rows.filter((r) => r.deal_id === "D100124").map((r) => r.source);
    expect(order[0]).toBe("מתווך");
    expect(winner("D100124").source).toBe("רשות המסים");
  });

  it("no deal id is counted twice among the rows that are in stats", () => {
    const ok = deals.filter((d) => d.status === "ok").map((d) => d.id);
    expect(new Set(ok).size).toBe(ok.length);
  });
});

describe("validity and flags", () => {
  it.each(["D100251", "D100317"])("%s is excluded as invalid_price", (id) => {
    const d = rowsOf(id)[0];
    expect(d.status).toBe("excluded");
    expect(d.flags).toContain("invalid_price");
    expect(d.priceNis).toBeNull();
  });

  it.each(["D100001", "D100193", "D100160"])("%s is an outlier", (id) => {
    const d = rowsOf(id)[0];
    expect(d.status).toBe("excluded");
    expect(d.flags).toContain("outlier_price");
  });

  it("missing size: price per m² is null, deal stays in", () => {
    const d = rowsOf("D100223")[0];
    expect(d.sizeSqm).toBeNull();
    expect(d.pricePerSqm).toBeNull();
    expect(d.flags).toContain("missing_size");
    expect(d.status).toBe("ok");
  });

  it("month-only date", () => {
    const d = rowsOf("D100171")[0];
    expect(d.date).toBe("2025-08");
    expect(d.datePrecision).toBe("month");
    expect(d.flags).toContain("month_only_date");
  });

  it("garden apartment on a high floor is kept with a warning", () => {
    const d = rowsOf("D100076")[0];
    expect(d.flags).toContain("garden_high_floor");
    expect(d.status).toBe("ok");
  });

  it("price per m² is recomputed from price and size", () => {
    for (const d of deals) {
      if (d.priceNis !== null && d.sizeSqm) expect(d.pricePerSqm).toBe(Math.round(d.priceNis / d.sizeSqm));
      else expect(d.pricePerSqm).toBeNull();
    }
  });

  it("Florentin row with English spelling is merged into פלורנטין", () => {
    expect(rowsOf("D100495")[0].neighborhood).toBe("פלורנטין");
  });
});

describe("report", () => {
  it("counts match the known issues", () => {
    const count = (flag: string) => report.issues.find((i) => i.flag === flag)?.count ?? 0;
    expect(report.rawRows).toBe(530);
    expect(report.uniqueDeals).toBe(520);
    expect(count("exact_duplicate")).toBe(6);
    expect(count("conflicting_duplicate")).toBe(4);
    expect(count("invalid_price")).toBe(2);
  });
});

describe("freshness", () => {
  it("committed JSON equals what the code produces from the CSV (run `npm run data` if this fails)", () => {
    const committedDeals = readFileSync("src/data/deals.json", "utf8");
    const committedReport = readFileSync("src/data/quality-report.json", "utf8");
    expect(serializeDeals(deals)).toBe(committedDeals);
    expect(JSON.stringify(buildReport(deals, rows.length), null, 2) + "\n").toBe(committedReport);
    expect(JSON.stringify(buildPlaces(deals), null, 2) + "\n").toBe(readFileSync("src/data/places.json", "utf8"));
  });
});
