import type { Metadata } from "next";
import Link from "next/link";
import { CsmClient } from "@/components/CsmClient";

export const metadata: Metadata = { title: "מצב נציג שירות" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function CsmPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const simulate = Array.isArray(sp.simulate) ? sp.simulate[0] : (sp.simulate ?? null);
  return (
    <main className="page">
      <p><Link href="/">← חזרה לבדיקת מחיר</Link></p>
      <h1>מצב נציג שירות</h1>
      <p className="lead">
        לקוח כתב שהמספר לא נכון? הדביקו את הקישור לתשובה שהוא ראה ואת ההודעה שלו. תקבלו מה הוא ראה, למה, ומה כנראה קרה, יחד עם טיוטת תשובה.
      </p>
      <CsmClient simulate={simulate} />
    </main>
  );
}
