"use client";

import { useState } from "react";
import type { InvestigateResponse } from "@/lib/investigate";
import { FLAG_META } from "@/lib/flags";
import { fmtInt } from "@/lib/facts";
import { AnswerCard } from "./AnswerCard";

type Investigated = Extract<InvestigateResponse, { kind: "investigated" }>;
const CLIENT_TIMEOUT_MS = 25_000;

function ReplyDraft({ text }: { text: string }) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={6} aria-label="טיוטת תשובה ללקוח" />
      <div className="row">
        <button type="button" onClick={copy}>{copied ? "הועתק" : "העתק תשובה"}</button>
        <span className="label">טיוטה לעריכה. קראו לפני שליחה.</span>
      </div>
    </div>
  );
}

export function CsmClient({ simulate }: { simulate: string | null }) {
  const [receipt, setReceipt] = useState("");
  const [complaint, setComplaint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLink, setNeedsLink] = useState<string | null>(null);
  const [result, setResult] = useState<Investigated | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsLink(null);
    setResult(null);
    setBusy(true);
    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/investigate${simulate ? `?simulate=${encodeURIComponent(simulate)}` : ""}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receipt, complaint }),
        signal: controller.signal,
      });
      const json = (await res.json()) as InvestigateResponse;
      if (!json.ok) setError(json.error);
      else if (json.kind === "needs_link") setNeedsLink(json.message);
      else setResult(json);
    } catch (err) {
      setError((err as Error).name === "AbortError" ? "השרת לא ענה בזמן. נסו שוב." : "החיבור נכשל. בדקו את האינטרנט ונסו שוב.");
    } finally {
      clearTimeout(abort);
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="ask">
        <label htmlFor="receipt">הקישור לתשובה שהלקוח ראה</label>
        <input id="receipt" value={receipt} onChange={(e) => setReceipt(e.target.value)} dir="ltr" placeholder="https://…/?r=…" />
        <label htmlFor="complaint">ההודעה של הלקוח, כמו שהיא</label>
        <textarea id="complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={5} placeholder="הדביקו כאן את הפנייה" />
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? "בודק…" : "חקור"}</button>
        </div>
      </form>

      {busy ? <p role="status" className="loading">משחזר את התשובה ובודק…</p> : null}
      {error ? <p role="alert" className="notice notice-bad">{error}</p> : null}
      {needsLink ? <p role="alert" className="notice notice-warn">{needsLink}</p> : null}

      {result ? (
        <>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>1. מה הלקוח ראה</h2>
            <AnswerCard r={result.answer} stale={result.checks.some((c) => c.id === "data_changed")} />
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>2. בדיקות אוטומטיות</h2>
            <p className="label">נעשו בקוד, בלי AI.</p>
            {result.checks.length === 0 ? (
              <p>הבדיקות לא מצאו הסבר להבדל.</p>
            ) : (
              <ul>
                {result.checks.map((c) => (
                  <li key={c.id}><strong>{c.labelHe}.</strong> {c.detailHe}</li>
                ))}
              </ul>
            )}
            {result.customerDeals.length > 0 ? (
              <>
                <h4>עסקאות בנתונים שדומות למה שהלקוח כתב</h4>
                <ul>
                  {result.customerDeals.map((m) => (
                    <li key={`${m.deal.id}-${m.deal.source}-${m.deal.priceNis}`}>
                      <bdi>{m.deal.id}</bdi> · {m.deal.street ?? m.deal.city} · {m.deal.priceNis !== null ? <bdi>{fmtInt(m.deal.priceNis)} ₪</bdi> : "מחיר לא תקין"} · {m.deal.source}
                      {" "}({m.matchedBy === "price+street" ? "מחיר ורחוב תואמים" : m.matchedBy === "price" ? "מחיר קרוב בלבד" : "רחוב בלבד"};{" "}
                      {m.excludedReason === null ? "נכללה בחישוב" : `לא נכללה: ${FLAG_META[m.excludedReason].labelHe}`})
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>3. הסבר לנציג וטיוטת תשובה</h2>
            {result.message ? <p className="notice notice-warn">{result.message}</p> : null}
            <p className="label">{result.result.source === "llm" ? "נכתב על ידי AI, ועבר בדיקת מספרים." : "טיוטה אוטומטית, נבנתה מהבדיקות."}</p>
            <h4>הסבר לנציג</h4>
            <p>{result.result.explanationForCsm}</p>
            <h4>טיוטת תשובה ללקוח</h4>
            <ReplyDraft key={result.result.replyToCustomer} text={result.result.replyToCustomer} />
          </section>

          {result.escalate ? (
            <section className="notice notice-warn">
              <strong>מתי לפנות ל-R&D:</strong> {result.checks.length === 0 ? "הבדיקות לא מצאו הסבר להבדל." : "יש חשד לטעות שהבדיקות לא מסבירות."}{" "}
              צרפו את הקישור, את ההודעה של הלקוח, ואת ״פרטים טכניים״ מהתשובה. קוד: <bdi>{result.rid}</bdi>
            </section>
          ) : null}

          <details className="debug">
            <summary>פרטים טכניים</summary>
            <pre dir="ltr">{JSON.stringify({ rid: result.rid, failure: result.failure, debug: result.debug }, null, 2)}</pre>
          </details>
        </>
      ) : null}
    </>
  );
}
