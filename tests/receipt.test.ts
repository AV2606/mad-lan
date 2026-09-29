import { describe, expect, it } from "vitest";
import { DATASET_VERSION, ReceiptError, decodeReceipt, encodeReceipt, isStale } from "../src/lib/receipt";
import type { QueryPlan } from "../src/lib/plan";

const plan: QueryPlan = {
  intent: "estimate",
  areas: [{ city: "גבעתיים", neighborhood: "שינקין" }],
  propertyType: "דירה",
  rooms: 4,
  sizeSqm: 100,
  askingPriceNis: 4_200_000,
  unsupportedReason: null,
  mentionedPlace: null,
  clarifyQuestion: null,
};

describe("receipt", () => {
  it("round trip: the plan and the dataset version come back exactly", () => {
    const r = encodeReceipt(plan);
    const back = decodeReceipt(r.token);
    expect(back.plan).toEqual(plan);
    expect(back.datasetVersion).toBe(DATASET_VERSION);
    expect(back.code).toBe(r.code);
  });

  it("the token is URL-safe and Hebrew survives", () => {
    const { token } = encodeReceipt(plan);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeReceipt(token).plan.areas[0].neighborhood).toBe("שינקין");
  });

  it("short code is R- plus 6 uppercase hex, and stable for the same plan", () => {
    expect(encodeReceipt(plan).code).toMatch(/^R-[0-9A-F]{6}$/);
    expect(encodeReceipt(plan).code).toBe(encodeReceipt({ ...plan }).code);
    expect(encodeReceipt({ ...plan, rooms: 3 }).code).not.toBe(encodeReceipt(plan).code);
  });

  it("garbage, truncated and tampered tokens give a clear error, never a crash", () => {
    const { token } = encodeReceipt(plan);
    for (const bad of ["", "not-a-token", token.slice(0, 20), token.slice(0, 30) + "!!" + token.slice(32)]) {
      expect(() => decodeReceipt(bad)).toThrow(ReceiptError);
    }
  });

  it("a well-formed token carrying an invalid plan is rejected", () => {
    const evil = Buffer.from(JSON.stringify({ v: "x", p: { ...plan, rooms: 999 } })).toString("base64url");
    expect(() => decodeReceipt(evil)).toThrow(ReceiptError);
  });

  it("detects a dataset version mismatch", () => {
    expect(isStale(encodeReceipt(plan))).toBe(false);
    expect(isStale(decodeReceipt(encodeReceipt(plan, "old000").token))).toBe(true);
  });
});
