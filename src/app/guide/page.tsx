import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import shots from "./shots.json";

export const metadata: Metadata = { title: "מדריך לנציג שירות" };

type ShotName = keyof typeof shots;

/** Screenshots live in /public/guide. Retake them with the same file names and update shots.json if the size changes. */
function Shot({ name, alt, caption }: { name: ShotName; alt: string; caption: string }) {
  const { width, height } = shots[name];
  return (
    <figure id={`guide-shot-${name}`} className="shot">
      <Image id={`guide-shot-${name}-image`} src={`/guide/${name}.png`} alt={alt} width={width} height={height} sizes="(max-width: 880px) 100vw, 880px" />
      <figcaption id={`guide-shot-${name}-caption`}>{caption}</figcaption>
    </figure>
  );
}

export default function GuidePage() {
  return (
    <main id="guide-page" className="page guide">
      <p id="guide-back"><Link id="guide-back-link" href="/">← חזרה לבדיקת מחיר</Link></p>
      <h1 id="guide-title">מדריך לנציג שירות</h1>
      <p id="guide-lead" className="lead">
        עמוד אחד: מה האפליקציה עושה, מה היא לא יכולה, ומה עושים כשלקוח כותב שהמספר לא נכון. בסוף יש תשובה מוכנה לשליחה.
      </p>

      <h2 id="guide-what-title">מה האפליקציה עושה</h2>
      <p id="guide-what-intro">
        היא עונה על שאלות כמו ״כמה עולה דירת 4 חדרים בגבעתיים?״ מתוך רשימה של עסקאות מכירה שבוצעו. <strong id="guide-what-receipt">כל מספר מגיע עם קבלה:</strong>{" "}
        אילו עסקאות עומדות מאחוריו, אילו עסקאות הוצאו מהחישוב ולמה, ועד כמה אפשר לסמוך עליו.
      </p>
      <p id="guide-what-ai">
        המספרים מחושבים בקוד, לא על ידי AI. ה-AI רק מבין את השאלה וכותב הסבר קצר. כל מספר שהוא כותב נבדק מול החישוב, ואם משהו לא תואם מוצג במקומו הסבר אוטומטי (מסומן ״הסבר אוטומטי״).
      </p>
      <Shot name="ask" alt="תיבת השאלה בדף הראשי עם שאלה לדוגמה ושורת דוגמאות" caption="הדף הראשי: כותבים שאלה רגילה בעברית, או לוחצים על אחת הדוגמאות." />

      <h2 id="guide-read-title">איך קוראים תשובה</h2>
      <Shot name="answer" alt="כרטיס תשובה עם טווח מחיר, רמת ביטחון ועל מה זה מבוסס" caption="כרטיס תשובה: הטווח, רמת הביטחון והסיבות לה, ועל מה הכול מבוסס." />
      <ul id="guide-read-list">
        <li id="guide-read-range"><strong id="guide-read-range-label">הטווח:</strong> המקום שבו נמצאו רוב העסקאות הדומות. זה לא ״מחיר הדירה״ ואף פעם לא ״מחיר הוגן״.</li>
        <li id="guide-read-confidence"><strong id="guide-read-confidence-label">רמת ביטחון</strong> (גבוהה / בינונית / נמוכה) וכל הסיבות שלה מתחתיה. ברוב התשובות ברמת שכונה היא נמוכה או בינונית, כי בכל שכונה יש מעט עסקאות.</li>
        <li id="guide-read-basis"><strong id="guide-read-basis-label">״על מה זה מבוסס״:</strong> כמה עסקאות, באיזה אזור, באיזו תקופה, ומאיזה מקור (רשות המסים, מתווך, בעל נכס).</li>
        <li id="guide-read-widened"><strong id="guide-read-widened-label">״הרחבנו לכל העיר״:</strong> אם בשכונה לא היו לפחות 5 עסקאות דומות, המספר הוא של כל העיר. זה כתוב בבירור בכל תשובה כזו.</li>
        <li id="guide-read-excluded"><strong id="guide-read-excluded-label">״מה לא נכלל ולמה״:</strong> עסקאות שנפסלו, למשל מחיר לא תקין, מחיר חריג מאוד, או עסקה שהופיעה פעמיים עם מחירים שונים.</li>
      </ul>
      <Shot name="excluded" alt="רשימת העסקאות שלא נכללו בחישוב, עם הסיבה לכל אחת" caption="״מה לא נכלל ולמה״: כל עסקה שהוצאה מהחישוב מוצגת עם הסיבה." />
      <p id="guide-read-receipt">
        בתחתית כל תשובה יש <strong id="guide-read-receipt-code">קוד</strong> (R-XXXXXX) וכפתור <strong id="guide-read-receipt-button">״העתק קישור״</strong>. הקישור משחזר בדיוק את אותם מספרים, ובלעדיו אי אפשר לשחזר תשובה.
      </p>
      <Shot name="receipt" alt="שורת הקבלה בתחתית התשובה: קוד, כפתור העתק קישור וגרסת נתונים" caption="הקבלה: הקוד, ״העתק קישור״ וגרסת הנתונים." />

      <h2 id="guide-limits-title">מה האפליקציה לא יכולה</h2>
      <ul id="guide-limits-list">
        <li id="guide-limits-scope"><strong id="guide-limits-scope-label">אין בה שכירות, מחירים מבוקשים, תחזיות עתידיות, משכנתאות או מיסוי.</strong> אלה עסקאות מכירה בלבד.</li>
        <li id="guide-limits-time"><strong id="guide-limits-time-label">היא לא מתאימה מחירים לזמן.</strong> הנתונים הם מינואר 2021 עד יולי 2026. עסקה ישנה נספרת כמו חדשה, ובאזורים שמתייקרים זה מוריד את הטווח.</li>
        <li id="guide-limits-small"><strong id="guide-limits-small-label">בשכונות רבות יש 1 עד 5 עסקאות בלבד.</strong> לכן הרבה תשובות הן של כל העיר.</li>
        <li id="guide-limits-location"><strong id="guide-limits-location-label">אין בה מיקום מדויק</strong>, ולכן אין ״שכונות סמוכות״.</li>
        <li id="guide-limits-memory"><strong id="guide-limits-memory-label">היא לא זוכרת תשובות.</strong> בלי הקישור אי אפשר לשחזר תשובה, והקוד לבדו לא מספיק.</li>
      </ul>

      <h2 id="guide-wrong-title">כשלקוח אומר ״המספר לא נכון״</h2>
      <ol id="guide-steps" className="steps">
        <li id="guide-step-1">
          <strong id="guide-step-1-label">בקשו את הקישור</strong> לתשובה (בדף התשובה: ״העתק קישור״). קוד בלבד לא מספיק.
        </li>
        <li id="guide-step-2">
          פתחו את <Link id="guide-step-2-csm-link" href="/csm">״מצב נציג שירות״</Link> (הקישור בתחתית כל דף). הדביקו את הקישור ואת ההודעה של הלקוח, כמו שהיא, ולחצו ״חקור״.
          <Shot name="csm-form" alt="טופס מצב נציג שירות עם קישור והודעת לקוח" caption="מצב נציג שירות: קישור לתשובה, ההודעה של הלקוח, ו״חקור״." />
        </li>
        <li id="guide-step-3">
          קראו לפי הסדר. <strong id="guide-step-3-label">1. מה הלקוח ראה:</strong> אותה תשובה בדיוק.
          <Shot name="csm-seen" alt="התשובה שהלקוח ראה, משוחזרת" caption="שלב 1: התשובה שהלקוח ראה." />
        </li>
        <li id="guide-step-4">
          <strong id="guide-step-4-label">2. בדיקות אוטומטיות:</strong> מדגם קטן, הרחבה לכל העיר, עסקאות ישנות, עסקאות חריגות שהוצאו, מחיר סותר לאותה עסקה, ועוד. אם הלקוח כתב מחיר ורחוב, הכלי מחפש בנתונים עסקה שמתאימה, כולל עסקאות שהוצאו מהחישוב. הוא כותב ״כנראה״ כשהוא לא בטוח, ו״אי אפשר לדעת״ כשהלקוח לא כתב רחוב.
          <Shot name="csm-checks" alt="רשימת הבדיקות האוטומטיות והעסקאות שדומות למה שהלקוח כתב" caption="שלב 2: מה הבדיקות מצאו." />
        </li>
        <li id="guide-step-5">
          <strong id="guide-step-5-label">3. הסבר לנציג וטיוטת תשובה:</strong> טיוטה לעריכה, לא תשובה סופית. תמיד קראו לפני שליחה.
          <Shot name="csm-draft" alt="הסבר לנציג וטיוטת תשובה ללקוח עם כפתור העתק" caption="שלב 3: הסבר לנציג וטיוטת תשובה שאפשר לערוך ולהעתיק." />
        </li>
        <li id="guide-step-6">
          <strong id="guide-step-6-label">אל תבטיחו תיקון ואל תגידו ללקוח שהוא טועה.</strong> הטיוטה כתובה כך, וכדאי לשמור על זה גם כשעורכים.
        </li>
        <li id="guide-step-7">
          <strong id="guide-step-7-label">מתי לפנות ל-R&amp;D:</strong> כשהכלי כותב ״מתי לפנות ל-R&amp;D״ (הבדיקות לא מסבירות את ההבדל), או כשהלקוח מצביע על טעות ברורה בנתונים. צרפו את הקישור, את ההודעה של הלקוח, ואת ״פרטים טכניים״ מתחתית התשובה.
        </li>
      </ol>

      <h2 id="guide-reply-title">תשובה שאפשר לשלוח</h2>
      <p id="guide-reply-intro">אפשר להתאים את המספרים והסיבה מהבדיקות בכלי:</p>
      <blockquote id="guide-reply-template" className="reply">
        <p id="guide-reply-greeting">שלום, תודה שפנית אלינו ושהערת.</p>
        <p id="guide-reply-body">
          המספר שהוצג מבוסס על <strong id="guide-reply-count">[מספר]</strong> עסקאות דומות ב<strong id="guide-reply-area">[אזור]</strong>, בין <strong id="guide-reply-from">[חודש שנה]</strong> ל-<strong id="guide-reply-to">[חודש שנה]</strong>. זה טווח שבו נמצאו רוב העסקאות, ולא מחיר של דירה מסוימת.
        </p>
        <p id="guide-reply-reason">
          <strong id="guide-reply-reason-text">[הסיבה מהבדיקות, למשל: בשכונה עצמה לא היו מספיק עסקאות, ולכן השווינו לכל העיר. / העסקה שציינת לא מופיעה בנתונים שלנו.]</strong>
        </p>
        <p id="guide-reply-closing">אם תוכל לשלוח לנו את הכתובת, התאריך והמחיר של העסקה שאתה מכיר, נעביר אותה לבדיקה.</p>
      </blockquote>

      <h2 id="guide-ai-down-title">אם ה-AI לא עובד</h2>
      <p id="guide-ai-down-text">
        האפליקציה ממשיכה לעבוד. אם רק ההסבר נכשל, המספרים והעסקאות מוצגים עם ״הסבר אוטומטי״. אם ההבנה של השאלה נכשלה, יופיע טופס חיפוש ידני (עיר, שכונה, סוג נכס, חדרים, שטח). במצב נציג שירות תופיע הודעה שטיוטת ה-AI לא זמינה, יחד עם טיוטה שנבנתה מהבדיקות.
      </p>
      <Shot name="manual" alt="הודעת כשל וטופס חיפוש ידני" caption="כשהבנת השאלה נכשלת: הודעה ברורה וטופס חיפוש ידני." />
    </main>
  );
}
