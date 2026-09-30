"use client";

import { useEffect, useRef, useState } from "react";
import type { AskResponse } from "@/lib/ask";
import type { QueryPlan } from "@/lib/plan";
import { EXAMPLE_QUESTIONS_HE } from "@/lib/templates";
import { AnswerCard } from "./AnswerCard";
import { ManualForm } from "./ManualForm";

type Ok = Extract<AskResponse, { ok: true }>;

// worst case on the server is parse (10s) + narrate (10s); the client must never wait longer than this
const CLIENT_TIMEOUT_MS = 25_000;
const MAX_CHARS = 500;

export function AskClient({
  initial, initialError, stale, simulate, stage,
}: {
  initial: Ok | null;
  initialError: string | null;
  stale: boolean;
  simulate: string | null;
  stage: string | null;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<null | "understanding" | "calculating">(null);
  const [result, setResult] = useState<Ok | null>(initial);
  const [error, setError] = useState<string | null>(initialError);
  const [showManual, setShowManual] = useState(initial?.showManualForm ?? false);
  const [isStale, setIsStale] = useState(stale);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function send(body: Record<string, unknown>, viaQuestion: boolean) {
    setError(null);
    setIsStale(false);
    setBusy(viaQuestion ? "understanding" : "calculating");
    if (viaQuestion) timer.current = setTimeout(() => setBusy("calculating"), 1500);

    const controller = new AbortController();
    const abort = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const params = new URLSearchParams();
      if (simulate) params.set("simulate", simulate);
      if (stage) params.set("stage", stage);
      const res = await fetch(`/api/ask${params.size ? `?${params}` : ""}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await res.json()) as AskResponse;
      if (!json.ok) {
        setError(json.error);
        return;
      }
      setResult(json);
      setShowManual(json.showManualForm);
      if (json.receipt) window.history.replaceState(null, "", `/?r=${json.receipt.token}${simulate ? `&simulate=${simulate}` : ""}`);
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setError(aborted ? "השרת לא ענה בזמן. אפשר לנסות שוב, או לחפש ידנית." : "החיבור נכשל. בדקו את האינטרנט ונסו שוב.");
      setShowManual(true);
    } finally {
      clearTimeout(abort);
      clearTimeout(timer.current);
      setBusy(null);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim() === "") {
      setError("כתבו שאלה כדי שנוכל לבדוק, למשל: ״כמה עולה דירת 3 חדרים בחולון?״");
      return;
    }
    if (question.length > MAX_CHARS) {
      setError(`השאלה ארוכה מדי. אפשר עד ${MAX_CHARS} תווים.`);
      return;
    }
    void send({ question }, true);
  }

  return (
    <>
      <form onSubmit={onSubmit} className="ask">
        <label htmlFor="q">מה תרצו לבדוק?</label>
        <textarea
          id="q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy) onSubmit(e);
          }}
          rows={3}
          placeholder="למשל: דירת 4 חדרים בגבעתיים, 100 מ״ר, ביקשו ממני 4.2 מיליון. זה הגיוני?"
        />
        <div className="chips">
          {EXAMPLE_QUESTIONS_HE.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setQuestion(ex)}>{ex}</button>
          ))}
        </div>
        <div className="row">
          <button type="submit" disabled={busy !== null}>{busy ? "בודק…" : "בדיקה"}</button>
          <button type="button" className="link-button" onClick={() => setShowManual((v) => !v)}>חיפוש ידני</button>
        </div>
      </form>

      {busy ? (
        <p role="status" className="loading">
          {busy === "understanding" ? "מבין את השאלה…" : "מחשב…"}
        </p>
      ) : null}

      {error ? <p role="alert" className="notice notice-bad">{error}</p> : null}

      {showManual ? (
        <ManualForm
          disabled={busy !== null}
          onSubmit={(plan: QueryPlan) => void send({ plan }, false)}
        />
      ) : null}

      {result ? <AnswerCard r={result} stale={isStale} /> : null}
    </>
  );
}
