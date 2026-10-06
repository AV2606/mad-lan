import type { Metadata } from "next";
import Link from "next/link";
import { CsmClient } from "@/components/CsmClient";

export const metadata: Metadata = { title: "מצב נציג שירות" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function CsmPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const simulate = Array.isArray(sp.simulate) ? sp.simulate[0] : (sp.simulate ?? null);
  return (
    <main id="csm-page" className="page">
      <p id="csm-back"><Link id="csm-back-link" href="/">← חזרה לבדיקת מחיר</Link></p>
      <h1 id="csm-title">מצב נציג שירות</h1>
      <p id="csm-lead" className="lead">
        לקוח כתב שהמספר לא נכון? הדביקו את הקישור לתשובה שהוא ראה ואת ההודעה שלו. תקבלו מה הוא ראה, למה, ומה כנראה קרה, יחד עם טיוטת תשובה.
      </p>
      <p id="csm-first-time" className="lead">פעם ראשונה? <Link id="csm-guide-link" href="/guide">המדריך לנציג שירות</Link>, עם צילומי מסך.</p>
      <CsmClient simulate={simulate} />
    </main>
  );
}
