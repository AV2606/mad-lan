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
    <div id="csm-reply-draft">
      <textarea id="csm-reply-draft-input" value={value} onChange={(e) => setValue(e.target.value)} rows={6} aria-label="טיוטת תשובה ללקוח" />
      <div id="csm-reply-draft-actions" className="row">
        <button id="csm-reply-copy-button" type="button" onClick={copy}>{copied ? "הועתק" : "העתק תשובה"}</button>
        <span id="csm-reply-draft-hint" className="label">טיוטה לעריכה. קראו לפני שליחה.</span>
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
      <form id="csm-form" onSubmit={submit} className="ask">
        <label id="csm-receipt-label" htmlFor="csm-receipt-input">הקישור לתשובה שהלקוח ראה</label>
        <input id="csm-receipt-input" value={receipt} onChange={(e) => setReceipt(e.target.value)} dir="ltr" placeholder="https://…/?r=…" />
        <label id="csm-complaint-label" htmlFor="csm-complaint-input">ההודעה של הלקוח, כמו שהיא</label>
        <textarea id="csm-complaint-input" value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={5} placeholder="הדביקו כאן את הפנייה" />
        <div id="csm-form-actions" className="row">
          <button id="csm-investigate-button" type="submit" disabled={busy}>{busy ? "בודק…" : "חקור"}</button>
        </div>
      </form>

      {busy ? <p id="csm-loading-status" role="status" className="loading">משחזר את התשובה ובודק…</p> : null}
      {error ? <p id="csm-error-message" role="alert" className="notice notice-bad">{error}</p> : null}
      {needsLink ? <p id="csm-needs-link-message" role="alert" className="notice notice-warn">{needsLink}</p> : null}

      {result ? (
        <>
          <section id="csm-step-seen" className="card">
            <h2 id="csm-step-seen-title" style={{ marginTop: 0 }}>1. מה הלקוח ראה</h2>
            <AnswerCard r={result.answer} stale={result.checks.some((c) => c.id === "data_changed")} />
          </section>

          <section id="csm-step-checks" className="card">
            <h2 id="csm-step-checks-title" style={{ marginTop: 0 }}>2. בדיקות אוטומטיות</h2>
            <p id="csm-step-checks-label" className="label">נעשו בקוד, בלי AI.</p>
            {result.checks.length === 0 ? (
              <p id="csm-checks-empty">הבדיקות לא מצאו הסבר להבדל.</p>
            ) : (
              <ul id="csm-checks-list">
                {result.checks.map((c) => (
                  <li key={c.id} id={`csm-check-${c.id}`}><strong id={`csm-check-${c.id}-label`}>{c.labelHe}.</strong> <span id={`csm-check-${c.id}-detail`}>{c.detailHe}</span></li>
                ))}
              </ul>
            )}
            {result.customerDeals.length > 0 ? (
              <>
                <h4 id="csm-customer-deals-title">עסקאות בנתונים שדומות למה שהלקוח כתב</h4>
                <ul id="csm-customer-deals-list">
                  {result.customerDeals.map((m, i) => (
                    <li key={`${m.deal.id}-${m.deal.source}-${m.deal.priceNis}`} id={`csm-customer-deal-${i + 1}`}>
                      <bdi>{m.deal.id}</bdi> · {m.deal.street ?? m.deal.city} · {m.deal.priceNis !== null ? <bdi>{fmtInt(m.deal.priceNis)} ₪</bdi> : "מחיר לא תקין"} · {m.deal.source}
                      {" "}({m.matchedBy === "price+street" ? "מחיר ורחוב תואמים" : m.matchedBy === "price" ? "מחיר קרוב בלבד" : "רחוב בלבד"};{" "}
                      {m.excludedReason === null ? "נכללה בחישוב" : `לא נכללה: ${FLAG_META[m.excludedReason].labelHe}`})
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section id="csm-step-draft" className="card">
            <h2 id="csm-step-draft-title" style={{ marginTop: 0 }}>3. הסבר לנציג וטיוטת תשובה</h2>
            {result.message ? <p id="csm-draft-message" className="notice notice-warn">{result.message}</p> : null}
            <p id="csm-draft-source-label" className="label">{result.result.source === "llm" ? "נכתב על ידי AI, ועבר בדיקת מספרים." : "טיוטה אוטומטית, נבנתה מהבדיקות."}</p>
            <h4 id="csm-explanation-title">הסבר לנציג</h4>
            <p id="csm-explanation-text">{result.result.explanationForCsm}</p>
            <h4 id="csm-reply-title">טיוטת תשובה ללקוח</h4>
            <ReplyDraft key={result.result.replyToCustomer} text={result.result.replyToCustomer} />
          </section>

          {result.escalate ? (
            <section id="csm-escalate" className="notice notice-warn">
              <strong id="csm-escalate-title">מתי לפנות ל-R&D:</strong> <span id="csm-escalate-reason">{result.checks.length === 0 ? "הבדיקות לא מצאו הסבר להבדל." : "יש חשד לטעות שהבדיקות לא מסבירות."}</span>{" "}
              <span id="csm-escalate-instructions">צרפו את הקישור, את ההודעה של הלקוח, ואת ״פרטים טכניים״ מהתשובה. קוד: <bdi>{result.rid}</bdi></span>
            </section>
          ) : null}

          <details id="csm-debug-details" className="debug">
            <summary id="csm-debug-summary">פרטים טכניים</summary>
            <pre id="csm-debug-json" dir="ltr">{JSON.stringify({ rid: result.rid, failure: result.failure, debug: result.debug }, null, 2)}</pre>
          </details>
        </>
      ) : null}
    </>
  );
}
