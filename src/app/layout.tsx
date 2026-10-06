import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "מאיפה המספר הזה?",
  description: "בדיקת מחיר דירה שבה כל מספר מגיע עם קבלה: העסקאות שעליהן הוא מבוסס, מה לא נכלל, ועד כמה אפשר לסמוך עליו.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        {children}
        <footer id="site-footer" className="site-footer">
          <Link id="site-footer-data-link" href="/data">מה אנחנו יודעים על הנתונים</Link> · <Link id="site-footer-csm-link" href="/csm">מצב נציג שירות</Link> · <Link id="site-footer-guide-link" href="/guide">מדריך לנציג שירות</Link>
        </footer>
      </body>
    </html>
  );
}
