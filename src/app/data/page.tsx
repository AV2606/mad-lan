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
    <main id="data-page" className="page">
      <p id="data-back"><Link id="data-back-link" href="/">← חזרה לבדיקת מחיר</Link></p>
      <h1 id="data-title">מה אנחנו יודעים על הנתונים</h1>
      <p id="data-summary" className="lead">
        מתוך <bdi>{report.rawRows}</bdi> שורות בקובץ: <bdi>{report.uniqueDeals}</bdi> עסקאות ייחודיות, ו-<bdi>{report.usableForStats}</bdi> שימשו לחישובי מחיר למ״ר.
        <br />
        תקופה: <bdi>{dateRange}</bdi> · גרסת נתונים: <bdi>{report.datasetVersion}</bdi>
      </p>

      <h2 id="data-issues-title">מה מצאנו בקובץ ומה עשינו</h2>
      <div id="data-issues-scroll" className="table-scroll">
        <table id="data-issues-table">
          <thead id="data-issues-head"><tr id="data-issues-head-row"><th id="data-issues-th-issue">בעיה</th><th id="data-issues-th-count">כמה עסקאות</th><th id="data-issues-th-action">מה עשינו</th><th id="data-issues-th-explanation">הסבר</th></tr></thead>
          <tbody id="data-issues-body">
            {report.issues.map((i) => (
              <tr key={i.flag} id={`data-issue-${i.flag}`}>
                <td id={`data-issue-${i.flag}-label`}>{FLAG_META[i.flag as Flag].labelHe}</td>
                <td id={`data-issue-${i.flag}-count`}><bdi>{i.count}</bdi></td>
                <td id={`data-issue-${i.flag}-action`}>{ACTION_HE[i.action]}</td>
                <td id={`data-issue-${i.flag}-explanation`} style={{ whiteSpace: "normal", minWidth: 260 }}>
                  {i.explanationHe}
                  <details id={`data-issue-${i.flag}-deals-details`}>
                    <summary id={`data-issue-${i.flag}-deals-summary`}>מזהי העסקאות</summary>
                    <bdi id={`data-issue-${i.flag}-deal-ids`}>{i.dealIds.join(", ")}</bdi>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="data-assumptions-title">הנחות שלנו</h2>
      <ul id="data-assumptions-list">{ASSUMPTIONS.map((a, i) => <li key={a} id={`data-assumption-${i + 1}`}>{a}</li>)}</ul>

      <h2 id="data-cities-title">כמה נתונים יש בכל עיר</h2>
      <p id="data-cities-lead" className="lead">רוב השכונות מכילות מעט עסקאות, ולכן הרבה תשובות מתבססות על כל העיר.</p>
      <div id="data-cities-scroll" className="table-scroll">
        <table id="data-cities-table">
          <thead id="data-cities-head"><tr id="data-cities-head-row"><th id="data-cities-th-city">עיר</th><th id="data-cities-th-deals">עסקאות</th><th id="data-cities-th-neighborhoods">שכונות</th></tr></thead>
          <tbody id="data-cities-body">
            {report.cities.map((c, i) => (
              <tr key={c.city} id={`data-city-${i + 1}`}><td id={`data-city-${i + 1}-name`}>{c.city}</td><td id={`data-city-${i + 1}-deals`}><bdi>{c.deals}</bdi></td><td id={`data-city-${i + 1}-neighborhoods`}><bdi>{c.neighborhoods}</bdi></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="data-missing-title">מה לא נמצא בנתונים</h2>
      <ul id="data-missing-list">{MISSING.map((m, i) => <li key={m} id={`data-missing-${i + 1}`}>{m}</li>)}</ul>
    </main>
  );
}
