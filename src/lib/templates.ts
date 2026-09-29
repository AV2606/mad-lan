import type { CompareFacts, EstimateFacts, Facts } from "./facts";
import type { FailureKind } from "./groq";
import { CITIES } from "./plan";
import type { QueryPlan } from "./plan";

/** Deterministic Hebrew texts: the fallback whenever the model is unavailable, wrong, or rejected by the number guard. */

// ---------- failures (F7) ----------

export const FAILURE_MESSAGE_HE: Record<FailureKind, string> = {
  timeout: "שירות הניסוח לא ענה בזמן. הנה המספרים עם הסבר אוטומטי.",
  rate_limited: "יש עומס זמני על שירות הניסוח. המספרים למטה מחושבים בלי AI.",
  unavailable: "שירות הניסוח לא זמין כרגע. הנה המספרים עם הסבר אוטומטי.",
  bad_output: "לא הצלחנו להבין את השאלה בוודאות. אפשר לנסח מחדש או לבחור ידנית:",
  guard_rejected: "",
  config: "התצורה של השרת חסרה. פנו לצוות.",
};

export const INTERNAL_ERROR_HE = (rid: string) => `משהו השתבש אצלנו. קוד לבירור: ${rid}`;
export const AUTO_EXPLANATION_LABEL_HE = "הסבר אוטומטי";

// ---------- unsupported / clarify ----------

export function unsupportedMessage(reason: QueryPlan["unsupportedReason"], mentionedPlace: string | null): string {
  switch (reason) {
    case "rent":
      return "בנתונים שלנו יש עסקאות מכירה בלבד, בלי שכירות, ולכן אי אפשר להעריך כאן מחירי שכירות.";
    case "forecast":
      return "אנחנו לא מנבאים מחירים. אפשר לראות מה היו המחירים בעסקאות שכבר בוצעו, אבל לא לאן הם ילכו.";
    case "mortgage_or_legal":
      return "שאלות על משכנתא, מיסוי או עניינים משפטיים הן מחוץ ליכולת של הכלי הזה. הוא מציג רק מחירי עסקאות שבוצעו.";
    case "place_not_in_data":
      return `אין לנו נתונים על ${mentionedPlace ?? "המקום שביקשתם"}. הערים שיש בנתונים: ${CITIES.join(", ")}.`;
    default:
      return "את השאלה הזו אי אפשר לענות מהנתונים שיש לנו: עסקאות מכירה של דירות בכמה ערים בישראל.";
  }
}

export const EXAMPLE_QUESTIONS_HE = [
  "דירת 4 חדרים בגבעתיים, 100 מ״ר, ביקשו ממני 4.2 מיליון. זה הגיוני?",
  "כמה עולה מטר בפלורנטין?",
  "מה יקר יותר, רעננה או כפר סבא?",
  "3 חדרים בבאר שבע",
];

// ---------- explanation templates ----------

const roomsPhrase = (f: EstimateFacts) => (f.requested.rooms !== null ? ` עם ${f.requested.rooms} חדרים` : "");

function estimateTemplate(f: EstimateFacts): string {
  if (f.status === "insufficient") {
    return `לא מצאנו מספיק עסקאות דומות ב${f.area} כדי לתת טווח אמין. נמצאו ${f.dealsFound} עסקאות מתאימות, ומינימום שאנחנו דורשים הוא ${f.minDeals}. לכן אנחנו לא מציגים טווח מחירים. אפשר לנסות אזור רחב יותר.`;
  }
  const parts: string[] = [];
  parts.push(
    `בדקנו ${f.dealsFound} עסקאות דומות ב${f.area}${roomsPhrase(f)}, בין ${f.dateFrom} ל-${f.dateTo}. החציון הוא ${f.medianPerSqm} למ״ר, ורוב העסקאות נעו בין ${f.typicalLowPerSqm} ל-${f.typicalHighPerSqm} למ״ר.`,
  );
  if (f.rangeLow && f.rangeHigh) {
    parts.push(`לנכס בגודל ${f.requested.sizeSqm} מ״ר זה טווח של ${f.rangeLow} עד ${f.rangeHigh}.`);
  }
  if (f.askingPerSqm && f.askingPosition) {
    parts.push(`המחיר המבוקש (${f.askingPerSqm} למ״ר) נמצא ${f.askingPosition}.`);
  }
  if (f.widened) parts.push(`${f.levelNote}.`);
  parts.push(`רמת הביטחון ${f.confidence}: ${f.confidenceReasons.join(", ")}.`);
  return parts.join(" ");
}

function compareTemplate(f: CompareFacts): string {
  const side = (e: EstimateFacts) =>
    e.status === "ok" ? `ב${e.area} החציון הוא ${e.medianPerSqm} למ״ר (${e.dealsFound} עסקאות)` : `ב${e.area} אין מספיק עסקאות להשוואה (${e.dealsFound} נמצאו)`;
  const head = `${side(f.a)}, ו${side(f.b)}.`;
  if (f.higherArea && f.differencePercent) {
    return `${head} החציון ב${f.higherArea} גבוה בכ-${f.differencePercent}.`;
  }
  return `${head} בלי מספיק עסקאות בשני האזורים אי אפשר להשוות ביניהם.`;
}

export function narrationTemplate(f: Facts): string {
  return f.kind === "compare" ? compareTemplate(f) : estimateTemplate(f);
}
