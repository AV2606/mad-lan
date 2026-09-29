import { createHash } from "node:crypto";
import { z } from "zod";
import report from "../data/quality-report.json";
import { QueryPlanSchema } from "./plan";
import type { QueryPlan } from "./plan";

/**
 * A receipt is the plan plus the dataset version, encoded in the URL. There is no storage (DILEMMAS #13):
 * the numbers are deterministic, so replaying the plan reproduces them exactly.
 */

export const DATASET_VERSION: string = report.datasetVersion;

const PayloadSchema = z.object({ v: z.string(), p: QueryPlanSchema }).strict();

export class ReceiptError extends Error {}

export type Receipt = { token: string; code: string; datasetVersion: string; plan: QueryPlan };

const codeFor = (token: string) => "R-" + createHash("sha256").update(token).digest("hex").slice(0, 6).toUpperCase();

/** Short code for logs when there is no plan yet (the question could not be understood). */
export const codeForText = (text: string) => codeFor(text);

export function encodeReceipt(plan: QueryPlan, datasetVersion = DATASET_VERSION): Receipt {
  const token = Buffer.from(JSON.stringify({ v: datasetVersion, p: plan }), "utf8").toString("base64url");
  return { token, code: codeFor(token), datasetVersion, plan };
}

export function decodeReceipt(token: string): Receipt {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new ReceiptError("receipt is not decodable");
  }
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) throw new ReceiptError("receipt content is invalid");
  return { token, code: codeFor(token), datasetVersion: parsed.data.v, plan: parsed.data.p };
}

export const isStale = (r: Receipt) => r.datasetVersion !== DATASET_VERSION;
