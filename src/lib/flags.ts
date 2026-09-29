import type { Flag, QualityIssue } from "./types";

type FlagMeta = {
  action: QualityIssue["action"];
  /** short tooltip text shown next to a deal */
  labelHe: string;
  /** longer text for the data-quality page */
  explanationHe: string;
};

/** Order here is the order flags are stored on a deal and listed on the data page. */
export const FLAG_META: Record<Flag, FlagMeta> = {
  exact_duplicate: {
    action: "removed",
    labelHe: "שורה כפולה",
    explanationHe: "אותה עסקה הופיעה פעמיים בקובץ בדיוק באותם פרטים. השארנו שורה אחת.",
  },
  conflicting_duplicate: {
    action: "removed",
    labelHe: "מחיר סותר לאותה עסקה",
    explanationHe:
      "אותה עסקה הופיעה פעמיים עם מחירים שונים. השארנו את המחיר מהמקור האמין יותר (רשות המסים, אחריה בעל הנכס, אחריו מתווך), והשורה השנייה מוצגת ולא נכללת בחישוב.",
  },
  invalid_price: {
    action: "excluded",
    labelHe: "מחיר לא תקין",
    explanationHe: "המחיר חסר או נמוך מ-300,000 ₪, כנראה טעות הקלדה. העסקה לא נכללת בחישוב.",
  },
  outlier_price: {
    action: "excluded",
    labelHe: "מחיר חריג",
    explanationHe:
      "המחיר למ״ר רחוק מאוד ממה שקורה בשאר העסקאות בעיר. יכול להיות שזו עסקה יוצאת דופן ויכול להיות טעות בנתונים, ולכן היא מוצגת אך לא נכללת בחישוב.",
  },
  missing_size: {
    action: "kept, warning",
    labelHe: "חסר גודל",
    explanationHe: "אין שטח בנתונים, ולכן אי אפשר לחשב מחיר למ״ר. העסקה נספרת אבל לא נכללת בחישובי המחיר למ״ר.",
  },
  garden_high_floor: {
    action: "kept, warning",
    labelHe: "דירת גן בקומה גבוהה",
    explanationHe: "דירת גן בקומה 4 ומעלה, וזה לא הגיוני. לא ברור איזה שדה שגוי, ולכן העסקה נשארת עם אזהרה.",
  },
  penthouse_not_top: {
    action: "kept, warning",
    labelHe: "פנטהאוז/דירת גג לא בקומה העליונה",
    explanationHe: "פנטהאוז או דירת גג שהקומה שלהם נמוכה מסך הקומות בבניין. העסקה נשארת עם אזהרה.",
  },
  new_but_old: {
    action: "kept, warning",
    labelHe: "חדש מקבלן בבניין ישן",
    explanationHe: "מצב הנכס הוא ״חדש מקבלן״ אבל שנת הבנייה לפני 2000. העסקה נשארת עם אזהרה.",
  },
  deal_before_built: {
    action: "kept, warning",
    labelHe: "נמכרה לפני שנת הבנייה",
    explanationHe: "תאריך העסקה קודם לשנת הבנייה. ייתכן שנמכרה ״על הנייר״, ולכן העסקה נשארת עם אזהרה.",
  },
  tiny_duplex: {
    action: "kept, warning",
    labelHe: "דופלקס קטן מאוד",
    explanationHe: "דופלקס קטן מ-40 מ״ר, וזה לא סביר. העסקה נשארת עם אזהרה.",
  },
  month_only_date: {
    action: "kept, info",
    labelHe: "תאריך לפי חודש בלבד",
    explanationHe: "בנתונים מופיע רק החודש והשנה, בלי היום.",
  },
  ppsqm_mismatch: {
    action: "kept, info",
    labelHe: "מחיר למ״ר בקובץ לא תואם",
    explanationHe: "עמודת המחיר למ״ר בקובץ שונה ביותר מ-2% ממה שמתקבל ממחיר וגודל. אנחנו מחשבים מחדש בעצמנו.",
  },
  missing_neighborhood: {
    action: "kept, info",
    labelHe: "חסרה שכונה",
    explanationHe: "השכונה לא מופיעה בנתונים. העסקה נכללת רק בחישובים ברמת העיר.",
  },
};

export const FLAG_ORDER = Object.keys(FLAG_META) as Flag[];
