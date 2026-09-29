import type { Metadata } from "next";
import Link from "next/link";
import report from "@/data/quality-report.json";
import { FLAG_META } from "@/lib/flags";
import type { Flag } from "@/lib/types";

export const metadata: Metadata = { title: "מה אנחנו יודעים על הנתונים" };

const ACTION_HE: Record<string, string> = {
  removed: "הוסרה מהחישובים",
  excluded: "לא נכללת בחישובים, אבל מוצגת",
  "kept, warning": "נשארת בחישובים, עם אזהרה",
  "kept, info": "נשארת בחישובים, עם הערה",
};

const ASSUMPTIONS = [
  "תאריכים כמו 04/05/2026 נקראים כיום/חודש/שנה (4 במאי), כמקובל בישראל.",
  "כשאותה עסקה מופיעה פעמיים עם מחירים שונים, אנחנו מעדיפים את רשות המסים, אחריה בעל הנכס, ואחריו המתווך.",
  "עמודת המחיר למ״ר בקובץ לא משמשת אותנו. אנחנו מחשבים מחדש מהמחיר והשטח.",
  "מחיר למ״ר שרחוק מאוד מהמחירים בשאר העיר נחשב חריג ולא נכלל, אבל מוצג ברשימת מה שלא נכלל.",
  "לא מתאימים מחירים לזמן. עסקה מ-2021 נספרת כמו עסקה מ-2026, ולכן טווחים שמערבבים שנים עשויים להיות נמוכים מדי באזורים שמתייקרים.",
  "מציגים טווח רק כשיש לפחות 5 עסקאות דומות. אם אין, מרחיבים בהדרגה מהשכונה לעיר, ואומרים את זה.",
  "המספר המרכזי הוא החציון, לא הממוצע, כי עם מעט עסקאות עסקה חריגה אחת מזיזה ממוצע בהרבה.",
  "שכונות נאחדות רק כשההבדל הוא איות או קיצור ברור. ״מרכז״ ו״מרכז העיר״ נשארות נפרדות.",
];

const MISSING = [
  "שכירות: הנתונים הם עסקאות מכירה בלבד.",
  "מחירים מבוקשים: יש רק מחירי עסקאות שבוצעו.",
  "מיקום מדויק: אין קואורדינטות, ולכן אין ״שכונות סמוכות״.",
  "מדד מחירים: אי אפשר להתאים מחירים ישנים להיום.",
];

export default function DataPage() {
  const dateRange = `${report.dateRange.from} עד ${report.dateRange.to}`;
  return (
    <main className="page">
      <p><Link href="/">← חזרה לבדיקת מחיר</Link></p>
      <h1>מה אנחנו יודעים על הנתונים</h1>
      <p className="lead">
        מתוך <bdi>{report.rawRows}</bdi> שורות בקובץ: <bdi>{report.uniqueDeals}</bdi> עסקאות ייחודיות, ו-<bdi>{report.usableForStats}</bdi> שימשו לחישובי מחיר למ״ר.
        <br />
        תקופה: <bdi>{dateRange}</bdi> · גרסת נתונים: <bdi>{report.datasetVersion}</bdi>
      </p>

      <h2>מה מצאנו בקובץ ומה עשינו</h2>
      <div className="table-scroll">
        <table>
          <thead><tr><th>בעיה</th><th>כמה עסקאות</th><th>מה עשינו</th><th>הסבר</th></tr></thead>
          <tbody>
            {report.issues.map((i) => (
              <tr key={i.flag}>
                <td>{FLAG_META[i.flag as Flag].labelHe}</td>
                <td><bdi>{i.count}</bdi></td>
                <td>{ACTION_HE[i.action]}</td>
                <td style={{ whiteSpace: "normal", minWidth: 260 }}>
                  {i.explanationHe}
                  <details>
                    <summary>מזהי העסקאות</summary>
                    <bdi>{i.dealIds.join(", ")}</bdi>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>הנחות שלנו</h2>
      <ul>{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul>

      <h2>כמה נתונים יש בכל עיר</h2>
      <p className="lead">רוב השכונות מכילות מעט עסקאות, ולכן הרבה תשובות מתבססות על כל העיר.</p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>עיר</th><th>עסקאות</th><th>שכונות</th></tr></thead>
          <tbody>
            {report.cities.map((c) => (
              <tr key={c.city}><td>{c.city}</td><td><bdi>{c.deals}</bdi></td><td><bdi>{c.neighborhoods}</bdi></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>מה לא נמצא בנתונים</h2>
      <ul>{MISSING.map((m) => <li key={m}>{m}</li>)}</ul>
    </main>
  );
}
