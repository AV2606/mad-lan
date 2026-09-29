import rawDeals from "../data/deals.json";
import { ask, logStages } from "./ask";
import type { AskResponse, StageRecord } from "./ask";
import { latestDealDate } from "./comps";
import type { CompsQuery, CompsResult, DealSummary } from "./comps";
import { areaLabel, fmtMonth, fmtNis } from "./facts";
import type { Facts } from "./facts";
import { FLAG_META } from "./flags";
import { callGroq, isSimulate } from "./groq";
import type { FailureKind, Simulate } from "./groq";
import { checkNumbers, extractNumbers, latinLeaks } from "./numberGuard";
import { buildInvestigateMessages } from "./prompts";
import { ReceiptError, decodeReceipt, isStale } from "./receipt";
import { FAILURE_MESSAGE_HE } from "./templates";
import type { Deal, Flag } from "./types";
import { z } from "zod";

const DEALS = rawDeals as unknown as Deal[];
const AS_OF = latestDealDate(DEALS);

export const MAX_COMPLAINT_CHARS = 2000;
const CLAIM_PRICE_TOLERANCE = 0.03;
const CLAIM_PRICE_RANGE = { min: 300_000, max: 60_000_000 };
const SMALL_SAMPLE_N = 8;
const OLD_YEARS = 3;

// ---------- checks ----------

export const CHECK_IDS = [
  "small_sample", "widened_area", "old_deals_included", "outliers_excluded", "conflicting_sources", "mixed_types",
  "data_changed", "customer_deal_used", "customer_deal_excluded", "customer_deal_not_in_data",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];
export const EXTRA_CAUSES = ["customer_misunderstanding", "possible_bug", "no_issue_found"] as const;
export const ALL_CAUSES: readonly string[] = [...CHECK_IDS, ...EXTRA_CAUSES];

export type Check = { id: CheckId; labelHe: string; detailHe: string };

export type CustomerDealMatch = {
  deal: DealSummary;
  /** price+street = strong (both agree); price = price only; street = street only */
  matchedBy: "price+street" | "price" | "street";
  /** null = the deal was used in the calculation */
  excludedReason: Flag | null;
};

const EXCLUSION_REASONS: Flag[] = ["invalid_price", "outlier_price", "conflicting_duplicate", "missing_size"];
const toSummary = (d: Deal): DealSummary => d as DealSummary;
const yearsBetween = (from: string, to: string) => {
  const day = (s: string) => Date.parse(s.length === 7 ? `${s}-01` : s) / 86_400_000;
  return (day(to) - day(from)) / 365.25;
};

const KNOWN_STREETS = [...new Set(DEALS.map((d) => d.street).filter((s): s is string => s !== null && s.length >= 3))];
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Street named in the text, allowing one attached Hebrew prefix letter ("בביאליק"), but not as part of a longer word ("הרצליה" is not "הרצל"). */
export const mentionsStreet = (text: string, street: string) =>
  new RegExp(`(?<![א-ת])[בלמהוכש]?${escapeRegExp(street)}(?![א-ת])`).test(text);

/**
 * Finds deals the customer may be talking about. A price alone is weak evidence (many deals sit within 3% of any
 * price), so a match is only "strong" when the price AND a street named in the complaint agree.
 * Excluded deals are searched on purpose: "your deal is in the data but was excluded" is a real answer.
 */
export function findCustomerDeals(complaint: string, cities: string[]): {
  claimedPrices: number[];
  claimedStreets: string[];
  matches: CustomerDealMatch[];
} {
  const claimedPrices = [
    ...new Set(extractNumbers(complaint).filter((n) => n >= CLAIM_PRICE_RANGE.min && n <= CLAIM_PRICE_RANGE.max)),
  ];
  const claimedStreets = KNOWN_STREETS.filter((st) => mentionsStreet(complaint, st));
  const pool = DEALS.filter((d) => cities.includes(d.city) && !d.flags.includes("exact_duplicate"));
  const reasonOf = (d: Deal): Flag | null => (d.status === "ok" ? null : EXCLUSION_REASONS.find((r) => d.flags.includes(r)) ?? null);

  // closest price first: an exact hit must outrank a deal that is merely within tolerance
  const distance = (d: DealSummary) => Math.min(...claimedPrices.map((p) => Math.abs((d.priceNis as number) - p) / p));
  const priceHit = (d: Deal) => d.priceNis !== null && claimedPrices.length > 0 && distance(d) <= CLAIM_PRICE_TOLERANCE;
  const streetHit = (d: Deal) => d.street !== null && claimedStreets.includes(d.street);

  const matches: CustomerDealMatch[] = pool
    .filter((d) => priceHit(d) || streetHit(d))
    .map((d): CustomerDealMatch => ({
      deal: toSummary(d),
      matchedBy: priceHit(d) && streetHit(d) ? "price+street" : priceHit(d) ? "price" : "street",
      excludedReason: reasonOf(d),
    }));

  const strength = { "price+street": 0, price: 1, street: 2 };
  matches.sort(
    (a, b) =>
      strength[a.matchedBy] - strength[b.matchedBy] ||
      (a.matchedBy === "street" ? b.deal.date.localeCompare(a.deal.date) : distance(a.deal) - distance(b.deal)) ||
      a.deal.id.localeCompare(b.deal.id),
  );
  // street-only matches are context, not a diagnosis: keep the list short
  const strong = matches.filter((m) => m.matchedBy !== "street");
  const streetOnly = matches.filter((m) => m.matchedBy === "street").slice(0, 3);
  return { claimedPrices, claimedStreets, matches: [...strong, ...streetOnly] };
}

type AnsweredArea = { query: CompsQuery; comps: CompsResult };

export function runChecks(args: {
  areas: AnsweredArea[];
  stale: boolean;
  complaint: ReturnType<typeof findCustomerDeals>;
}): Check[] {
  const checks = new Map<CheckId, Check>();
  const multi = args.areas.length > 1;
  const add = (id: CheckId, labelHe: string, detailHe: string) => {
    const prev = checks.get(id);
    checks.set(id, { id, labelHe, detailHe: prev ? `${prev.detailHe} ${detailHe}` : detailHe });
  };

  for (const { query, comps } of args.areas) {
    const where = multi ? `${areaLabel(query.city, query.neighborhood)}: ` : "";
    const s = comps.stats;
    const n = s ? s.n : comps.deals.length;
    if (comps.status === "insufficient" || n < SMALL_SAMPLE_N) {
      add("small_sample", "מדגם קטן", `${where}מבוסס על ${n} עסקאות בלבד.`);
    }
    if (query.neighborhood !== null && (comps.level === "L3" || comps.level === "L4")) {
      add("widened_area", "הורחב לכל העיר", `${where}לא היו מספיק עסקאות בשכונה ${query.neighborhood}, ולכן החישוב הוא של כל העיר ${query.city}.`);
    }
    if (s && yearsBetween(s.dateFrom, AS_OF) > OLD_YEARS) {
      add("old_deals_included", "עסקאות ישנות", `${where}העסקה הוותיקה ביותר היא מ-${fmtMonth(s.dateFrom)}, יותר מ-${OLD_YEARS} שנים לפני העסקה האחרונה בנתונים.`);
    }
    const outliers = comps.excluded.filter((e) => e.reason === "outlier_price");
    if (outliers.length > 0) {
      add("outliers_excluded", "עסקאות חריגות לא נכללו", `${where}${outliers.length} עסקאות עם מחיר חריג הוצאו מהחישוב (${outliers.map((o) => o.deal.id).join(", ")}).`);
    }
    const twins = comps.deals.filter((d) => DEALS.some((x) => x.id === d.id && x.flags.includes("conflicting_duplicate")));
    if (twins.length > 0) {
      add("conflicting_sources", "מחיר סותר לאותה עסקה", `${where}לעסקאות ${twins.slice(0, 3).map((t) => t.id).join(", ")} היו שני מחירים שונים בקובץ, והשתמשנו במחיר מהמקור האמין יותר.`);
    }
    if (query.propertyType === null) {
      add("mixed_types", "כל סוגי הנכסים", `${where}לא צוין סוג נכס, ולכן ההשוואה כוללת סוגי נכסים שונים.`);
    }
  }
  if (args.stale) add("data_changed", "הנתונים עודכנו", "הנתונים עודכנו מאז שהתשובה הופקה, ולכן ייתכן שהמספרים שונים.");

  const { claimedPrices, claimedStreets, matches } = args.complaint;
  const strongMatch = matches.find((m) => m.matchedBy === "price+street");
  const priceOnly = matches.find((m) => m.matchedBy === "price");
  const describe = (m: CustomerDealMatch) => `${m.deal.id} (${fmtNis(m.deal.priceNis as number)})`;

  if (strongMatch) {
    // price and street both agree: this is very likely the customer's deal
    if (strongMatch.excludedReason === null) {
      add("customer_deal_used", "העסקה של הלקוח נמצאת ונכללה", `נמצאה בנתונים עסקה שמתאימה במחיר וברחוב: ${describe(strongMatch)}, מתאריך ${fmtMonth(strongMatch.deal.date)}. כנראה זו העסקה שהלקוח מתכוון אליה, והיא נכללה בחישוב.`);
    } else {
      add("customer_deal_excluded", "העסקה של הלקוח נמצאת אבל לא נכללה", `נמצאה בנתונים עסקה שמתאימה במחיר וברחוב: ${describe(strongMatch)}, מתאריך ${fmtMonth(strongMatch.deal.date)}. כנראה זו העסקה שהלקוח מתכוון אליה, אבל היא לא נכללה בחישוב: ${FLAG_META[strongMatch.excludedReason].labelHe}.`);
    }
  } else if (claimedPrices.length > 0 && claimedStreets.length === 0 && priceOnly) {
    // a price but no street: a similar price exists, which proves nothing about whose deal it is
    add("customer_deal_not_in_data", "לא ניתן לאמת את העסקה של הלקוח", `הלקוח לא ציין רחוב. יש בנתונים עסקה במחיר קרוב (${describe(priceOnly)}), אבל אי אפשר לדעת אם זו העסקה שהוא מתכוון אליה.`);
  } else if (claimedPrices.length > 0) {
    const elsewhere = matches.filter((m) => m.matchedBy === "price");
    const onStreet = matches.filter((m) => m.matchedBy === "street");
    const extra = [
      elsewhere.length > 0 ? ` יש עסקה במחיר קרוב (${describe(elsewhere[0])}) אבל לא ברחוב שצוין.` : "",
      onStreet.length > 0 ? " יש עסקאות ברחוב שצוין, אבל לא במחיר הזה." : "",
    ].join("");
    add("customer_deal_not_in_data", "העסקה של הלקוח לא בנתונים", `לא נמצאה בנתונים עסקה שמתאימה לפרטים שהלקוח ציין (מחיר דומה ל-${fmtNis(claimedPrices[0])}).${extra}`);
  }
  return CHECK_IDS.flatMap((id) => (checks.has(id) ? [checks.get(id)!] : []));
}

// ---------- template (the fallback, and the CSM's safety net) ----------

const REPLY_SENTENCE: Partial<Record<CheckId, string>> = {
  widened_area: "בשכונה עצמה לא היו מספיק עסקאות, ולכן השווינו לכל העיר.",
  small_sample: "מדובר במספר קטן של עסקאות, ולכן הטווח מדויק פחות.",
  old_deals_included: "חלק מהעסקאות בהשוואה ישנות יחסית.",
  conflicting_sources: "לחלק מהעסקאות היו שני מחירים בקובץ, ובחרנו במקור האמין יותר.",
  customer_deal_not_in_data: "העסקה שציינתם לא מופיעה בנתונים שלנו. אם תשלחו לנו את פרטיה, נעביר אותה לבדיקה.",
  customer_deal_excluded: "נראה שהעסקה שציינתם נמצאת בנתונים, אבל היא לא נכללה בחישוב כי היה בה נתון שדרש בדיקה. נעביר אותה לבדיקה.",
  customer_deal_used: "נראה שהעסקה שציינתם נמצאת בנתונים ונכללה בחישוב, ולצדה עסקאות נוספות שמשפיעות על הטווח.",
  data_changed: "הנתונים התעדכנו מאז שהתשובה הופקה.",
  mixed_types: "ההשוואה כללה סוגי נכסים שונים.",
};
const REPLY_PRIORITY: CheckId[] = ["customer_deal_excluded", "customer_deal_not_in_data", "customer_deal_used", "widened_area", "small_sample", "conflicting_sources", "old_deals_included", "data_changed", "mixed_types"];

export function templateInvestigation(facts: Facts, checks: Check[], complaintHasDetails = true) {
  const ids = new Set(checks.map((c) => c.id));
  const reasons = REPLY_PRIORITY.filter((id) => ids.has(id)).slice(0, 3).map((id) => REPLY_SENTENCE[id]!);
  const f = facts.kind === "compare" ? facts.a : facts;
  const basis =
    f.status === "ok"
      ? `המספר שהוצג מבוסס על ${f.dealsFound} עסקאות דומות ב${f.area}, בין ${f.dateFrom} ל-${f.dateTo}.`
      : `לא היו מספיק עסקאות דומות ב${f.area} כדי לתת טווח אמין.`;
  const replyToCustomer = [
    "תודה שפניתם אלינו ושהערתם.",
    basis,
    ...(reasons.length > 0 ? reasons : ["בדקנו את החישוב ולא מצאנו סיבה ברורה להבדל שציינתם."]),
    "אם יש פרטים נוספים, כמו כתובת, תאריך ומחיר, נשמח לבדוק שוב.",
  ].slice(0, 6).join(" ");
  const explanationForCsm =
    checks.length > 0
      ? `הבדיקות האוטומטיות מצאו: ${checks.map((c) => c.labelHe).join(", ")}. פירוט מלא ברשימה למעלה.`
      : "הבדיקות האוטומטיות לא מצאו הסבר להבדל. כדאי לבקש מהלקוח פרטים נוספים, ואם הוא מצביע על טעות ברורה, לפנות ל-R&D.";
  return { causes: complaintHasDetails ? (checks.map((c) => c.id) as string[]) : [], explanationForCsm, replyToCustomer, escalate: false };
}

// ---------- LLM #3 ----------

const InvestigationSchema = z.object({
  causes: z.array(z.string()),
  explanationForCsm: z.string().min(1).max(1500),
  replyToCustomer: z.string().min(1).max(1500),
  escalate: z.boolean(),
});
export const INVESTIGATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["causes", "explanationForCsm", "replyToCustomer", "escalate"],
  properties: {
    causes: { type: "array", items: { type: "string", enum: [...ALL_CAUSES] } },
    explanationForCsm: { type: "string" },
    replyToCustomer: { type: "string" },
    escalate: { type: "boolean" },
  },
} as const;

/** Words that must never reach a customer: jargon, blame, promises. */
const REPLY_FORBIDDEN = ["חציון", "median", "outlier", "p25", "p75", "אחוזון", "טעיתם", "אתם טועים", "אתה טועה", "אנחנו נתקן", "נתקן את", "נעדכן תוך", "הוגן", "שווי"];
/** Wrong in either text: the headline number is a median, and calling it an average misdescribes it. */
const WRONG_TERMS = ["ממוצע"];
const MAX_REPLY_SENTENCES = 6;
const sentenceCount = (t: string) => t.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;

const HALLUCINATED_INVESTIGATION = JSON.stringify({
  causes: ["small_sample"],
  explanationForCsm: "הדירה שווה בפועל 9,999,999 ₪.",
  replyToCustomer: "תודה על פנייתכם. המחיר הנכון הוא 9,999,999 ₪.",
  escalate: false,
});

// ---------- entry point ----------

export type InvestigateInput = { receipt?: unknown; complaint?: unknown; simulate?: unknown };

export type InvestigateResponse =
  | {
      ok: true;
      kind: "needs_link";
      message: string;
    }
  | {
      ok: true;
      kind: "investigated";
      rid: string;
      answer: Extract<AskResponse, { ok: true }>;
      checks: Check[];
      customerDeals: CustomerDealMatch[];
      result: { source: "llm" | "template"; causes: string[]; explanationForCsm: string; replyToCustomer: string };
      escalate: boolean;
      failure: FailureKind | null;
      message: string | null;
      debug: { stages: StageRecord[]; simulate: Simulate | null; droppedCauses: string[] };
    }
  | { ok: false; status: number; error: string };

/** Accepts a full link, a `?r=` fragment, a raw token, or a bare code. */
export function extractReceiptToken(input: string): { token: string } | { bareCode: string } | null {
  const text = input.trim();
  if (/^R-[0-9A-Za-z]{6}$/i.test(text)) return { bareCode: text.toUpperCase() };
  try {
    const t = new URL(text).searchParams.get("r");
    if (t) return { token: t };
  } catch {
    /* not a URL */
  }
  const m = /[?&]r=([A-Za-z0-9_-]+)/.exec(text);
  if (m) return { token: m[1] };
  return /^[A-Za-z0-9_-]{40,}$/.test(text) ? { token: text } : null;
}

export async function investigate(input: InvestigateInput): Promise<InvestigateResponse> {
  const simulate: Simulate | null = isSimulate(input.simulate) ? input.simulate : null;
  if (typeof input.receipt !== "string" || input.receipt.trim() === "") {
    return { ok: false, status: 400, error: "הדביקו את הקישור לתשובה שהלקוח ראה." };
  }
  if (typeof input.complaint !== "string" || input.complaint.trim() === "") {
    return { ok: false, status: 400, error: "הדביקו את ההודעה של הלקוח." };
  }
  const complaint = input.complaint.trim();
  if (complaint.length > MAX_COMPLAINT_CHARS) {
    return { ok: false, status: 400, error: `ההודעה ארוכה מדי. אפשר עד ${MAX_COMPLAINT_CHARS} תווים.` };
  }

  const ref = extractReceiptToken(input.receipt);
  if (ref === null) return { ok: false, status: 400, error: "לא הצלחנו לקרוא את הקישור. העתיקו אותו שוב מדף התשובה (כפתור ״העתק קישור״)." };
  if ("bareCode" in ref) {
    return {
      ok: true,
      kind: "needs_link",
      message: `הקוד ${ref.bareCode} לא מספיק כדי לשחזר את התשובה, כי אנחנו לא שומרים תשובות. בקשו מהלקוח את הקישור המלא: בדף התשובה יש כפתור ״העתק קישור״.`,
    };
  }

  let receipt;
  try {
    receipt = decodeReceipt(ref.token);
  } catch (e) {
    if (e instanceof ReceiptError) return { ok: false, status: 400, error: "הקישור לא תקין או שנפגם בדרך. בקשו מהלקוח להעתיק אותו שוב." };
    throw e;
  }

  const replay = await ask({ plan: receipt.plan });
  if (!replay.ok) return replay;
  const rid = replay.rid;
  const stages: StageRecord[] = [];
  const fail = (error: string): InvestigateResponse => ({ ok: false, status: 400, error });

  if (replay.answer === null || replay.facts === null) {
    return fail("התשובה שהלקוח ראה לא הכילה מספרים (שאלה שלא נתמכת או שדרשה הבהרה), ולכן אין מה לבדוק.");
  }

  const areas: AnsweredArea[] =
    replay.answer.kind === "single"
      ? [{ query: replay.answer.query, comps: replay.answer.comps }]
      : replay.answer.queries.map((query, i) => ({ query, comps: (replay.answer as { compare: { areas: CompsResult[] } }).compare.areas[i] }));

  const complaintInfo = findCustomerDeals(complaint, [...new Set(areas.map((a) => a.query.city))]);
  const checks = runChecks({ areas, stale: isStale(receipt), complaint: complaintInfo });
  stages.push({ stage: "comps", ok: true, checks: checks.map((c) => c.id), matches: complaintInfo.matches.length });

  const complaintHasDetails = complaintInfo.claimedPrices.length > 0 || complaintInfo.claimedStreets.length > 0;
  const promptFacts = {
    complaintHasDetails,
    answer: replay.facts,
    checks: checks.map((c) => ({ id: c.id, detail: c.detailHe })),
    customerDeals: complaintInfo.matches.map((m) => ({
      id: m.deal.id, price: m.deal.priceNis === null ? null : fmtNis(m.deal.priceNis), street: m.deal.street,
      date: m.deal.date, matchedBy: m.matchedBy, usedInCalculation: m.excludedReason === null,
      exclusionReason: m.excludedReason === null ? null : FLAG_META[m.excludedReason].labelHe,
      exclusionExplanation: m.excludedReason === null ? null : FLAG_META[m.excludedReason].explanationHe,
      priceUsedInstead: m.deal.keptPriceNis === undefined ? null : fmtNis(m.deal.keptPriceNis),
    })),
  };
  const template = templateInvestigation(replay.facts, checks, complaintHasDetails);

  let result: { source: "llm" | "template"; causes: string[]; explanationForCsm: string; replyToCustomer: string } = { source: "template", ...template };
  let failure: FailureKind | null = null;
  let message: string | null = null;
  let droppedCauses: string[] = [];
  let llmEscalate = false;

  const res = await callGroq({
    messages: buildInvestigateMessages(promptFacts, complaint),
    schema: { name: "investigation", schema: INVESTIGATE_JSON_SCHEMA },
    zod: InvestigationSchema,
    simulate,
    hallucination: HALLUCINATED_INVESTIGATION,
  });
  if (!res.ok) {
    failure = res.kind;
    message = `טיוטת ה-AI לא זמינה: ${FAILURE_MESSAGE_HE[res.kind]} הטיוטה למטה נבנתה אוטומטית מהבדיקות.`;
    stages.push({ stage: "investigate", ok: false, latencyMs: res.latencyMs, kind: res.kind, detail: res.detail, raw: res.raw });
  } else {
    const allowedCauses = new Set<string>([...checks.map((c) => c.id), ...EXTRA_CAUSES]);
    // with nothing specific to explain, naming a "cause" would be inventing one
    const causes = complaintHasDetails ? res.data.causes.filter((c) => allowedCauses.has(c)) : [];
    droppedCauses = res.data.causes.filter((c) => !allowedCauses.has(c));

    const texts = [res.data.explanationForCsm, res.data.replyToCustomer];
    const guards = texts.map((t) => checkNumbers(t, promptFacts, [complaint]));
    const badNumbers = guards.flatMap((g) => (g.ok ? [] : g.badNumbers));
    const forbidden = [
      ...REPLY_FORBIDDEN.filter((w) => res.data.replyToCustomer.includes(w)),
      ...WRONG_TERMS.filter((w) => texts.some((t) => t.includes(w))),
      ...texts.flatMap(latinLeaks),
    ];
    const tooLong = sentenceCount(res.data.replyToCustomer) > MAX_REPLY_SENTENCES;

    if (badNumbers.length === 0 && forbidden.length === 0 && !tooLong) {
      result = { source: "llm", causes, explanationForCsm: res.data.explanationForCsm, replyToCustomer: res.data.replyToCustomer };
      llmEscalate = res.data.escalate || causes.includes("possible_bug");
      stages.push({ stage: "investigate", ok: true, latencyMs: res.latencyMs, model: res.model, droppedCauses });
    } else {
      failure = "guard_rejected";
      message = "טיוטת ה-AI לא עברה את הבדיקות שלנו, ולכן הטיוטה למטה נבנתה אוטומטית מהבדיקות.";
      stages.push({ stage: "investigate", ok: false, latencyMs: res.latencyMs, kind: "guard_rejected", badNumbers, forbiddenWords: forbidden, tooLong, raw: res.raw.slice(0, 600) });
    }
  }

  logStages(rid, stages);

  return {
    ok: true,
    kind: "investigated",
    rid,
    answer: replay,
    checks,
    customerDeals: complaintInfo.matches,
    result,
    // when nothing explains the gap, an engineer should look
    escalate: llmEscalate || checks.length === 0,
    failure,
    message,
    debug: { stages, simulate, droppedCauses },
  };
}
