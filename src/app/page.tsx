import { AskClient } from "@/components/AskClient";
import { ask } from "@/lib/ask";
import type { AskResponse } from "@/lib/ask";
import { ReceiptError, decodeReceipt, isStale } from "@/lib/receipt";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const token = first(sp.r);
  const simulate = first(sp.simulate);
  const stage = first(sp.stage);

  // Opening a receipt link replays the plan: same numbers, no model call.
  let initial: Extract<AskResponse, { ok: true }> | null = null;
  let initialError: string | null = null;
  let stale = false;
  if (token) {
    try {
      const receipt = decodeReceipt(token);
      stale = isStale(receipt);
      const res = await ask({ plan: receipt.plan });
      if (res.ok) initial = res;
      else initialError = res.error;
    } catch (e) {
      initialError =
        e instanceof ReceiptError ? "הקישור לא תקין או שנפגם בדרך. אפשר לשאול שוב את השאלה, או לבקש קישור חדש." : "משהו השתבש בפתיחת הקישור.";
    }
  }

  return (
    <main className="page">
      <header>
        <h1>מאיפה המספר הזה?</h1>
        <p className="lead">בדיקת מחיר דירה שבה כל מספר מגיע עם קבלה: העסקאות שעליהן הוא מבוסס, מה לא נכלל, ועד כמה אפשר לסמוך עליו.</p>
      </header>
      <AskClient initial={initial} initialError={initialError} stale={stale} simulate={simulate} stage={stage} />
    </main>
  );
}
