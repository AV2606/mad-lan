"use client";

import { useState } from "react";
import type { AskResponse } from "@/lib/ask";
import type { CompsQuery, CompsResult } from "@/lib/comps";
import { CONFIDENCE_HE, POSITION_HE, areaLabel, fmtMonth, fmtNis, levelNote } from "@/lib/facts";
import { AUTO_EXPLANATION_LABEL_HE } from "@/lib/templates";
import { DealsTable, ExcludedList } from "./DealsTable";

type Ok = Extract<AskResponse, { ok: true }>;

const num = (s: string) => <bdi>{s}</bdi>;

function CompsBlock({ query, comps, title }: { query: CompsQuery; comps: CompsResult; title?: string }) {
  const s = comps.stats;
  const widened = query.neighborhood !== null && (comps.level === "L3" || comps.level === "L4");
  return (
    <section className="comps-block">
      {title ? <h3>{title}</h3> : null}

      {comps.status === "insufficient" || s === null ? (
        <p className="headline headline-empty">אין מספיק עסקאות כדי לתת טווח אמין</p>
      ) : comps.priceRange ? (
        <>
          <p className="headline">{num(`${fmtNis(comps.priceRange.low)} – ${fmtNis(comps.priceRange.high)}`)}</p>
          <p className="subline">טווח שבו נמצאו רוב העסקאות הדומות, לנכס של {num(String(query.sizeSqm))} מ״ר. החציון: {num(fmtNis(s.median))} למ״ר.</p>
        </>
      ) : (
        <>
          <p className="headline">{num(fmtNis(s.median))} למ״ר</p>
          <p className="subline">החציון. רוב העסקאות בין {num(fmtNis(s.p25))} ל-{num(fmtNis(s.p75))} למ״ר.</p>
        </>
      )}

      <p className={`badge badge-${comps.confidence.level}`}>
        רמת ביטחון: {CONFIDENCE_HE[comps.confidence.level]}
      </p>
      <ul className="reasons">
        {comps.confidence.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {comps.askingPosition && comps.askingPricePerSqm !== null ? (
        <p className="asking">
          המחיר המבוקש הוא {num(fmtNis(comps.askingPricePerSqm))} למ״ר, והוא {POSITION_HE[comps.askingPosition]}.
        </p>
      ) : null}

      <h4>על מה זה מבוסס</h4>
      <ul className="basis">
        <li>{s ? <>{num(String(s.n))} עסקאות</> : <>נמצאו {num(String(comps.deals.length))} עסקאות מתאימות</>} · {areaLabel(query.city, query.neighborhood)}</li>
        <li className={widened ? "widened" : undefined}>{levelNote(comps.level, query)}</li>
        {s ? (
          <li>
            תקופה: {num(fmtMonth(s.dateFrom))} עד {num(fmtMonth(s.dateTo))}
          </li>
        ) : null}
        {s ? (
          <li>
            מקורות: רשות המסים {num(`${Math.round(s.sourceShare["רשות המסים"] * 100)}%`)}, בעלי נכסים {num(`${Math.round(s.sourceShare["בעל נכס"] * 100)}%`)}, מתווכים {num(`${Math.round(s.sourceShare["מתווך"] * 100)}%`)}
          </li>
        ) : null}
        <li>סינון: {comps.filtersApplied.join(" · ")}</li>
        {comps.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <details open={comps.deals.length <= 8}>
        <summary>העסקאות שבהן השתמשנו ({num(String(comps.deals.length))})</summary>
        {comps.deals.length > 0 ? <DealsTable deals={comps.deals} /> : <p>אין עסקאות להצגה.</p>}
      </details>
      <ExcludedList items={comps.excluded} />
    </section>
  );
}

function CopyLink({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?r=${token}`);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <button type="button" className="link-button" onClick={copy}>
      {state === "copied" ? "הקישור הועתק" : state === "failed" ? "לא הצלחנו להעתיק, העתיקו מהשורת כתובת" : "העתק קישור"}
    </button>
  );
}

export function AnswerCard({ r, stale = false }: { r: Ok; stale?: boolean }) {
  const single = r.answer?.kind === "single" ? r.answer : null;
  const compare = r.answer?.kind === "compare" ? r.answer : null;
  return (
    <article className="card" aria-live="polite">
      {stale ? <p className="notice notice-warn">הנתונים עודכנו מאז שהתשובה הזו הופקה, ולכן המספרים עשויים להיות שונים.</p> : null}
      {r.message && r.outcome !== "answer" ? <p className={`notice ${r.outcome === "parse_failed" ? "notice-warn" : "notice-info"}`}>{r.message}</p> : null}
      {r.message && r.outcome === "answer" ? <p className="notice notice-warn">{r.message}</p> : null}
      {r.planNotes.map((n) => (
        <p key={n} className="notice notice-info">{n}</p>
      ))}

      {single ? <CompsBlock query={single.query} comps={single.comps} /> : null}
      {compare ? (
        <>
          {r.facts?.kind === "compare" && r.facts.higherArea ? (
            <p className="headline">{r.facts.higherArea} יקרה יותר, בכ-{num(r.facts.differencePercent ?? "")}</p>
          ) : (
            <p className="headline headline-empty">אין מספיק עסקאות בשני האזורים כדי להשוות</p>
          )}
          <div className="compare-grid">
            {compare.compare.areas.map((c, i) => {
              const q = compare.queries[i];
              return <CompsBlock key={i} query={q} comps={c} title={areaLabel(q.city, q.neighborhood)} />;
            })}
          </div>
        </>
      ) : null}

      {r.narration ? (
        <section className="explanation">
          <h4>הסבר</h4>
          <p>{r.narration.text}</p>
          {r.narration.source === "template" ? <p className="label">{AUTO_EXPLANATION_LABEL_HE}</p> : null}
        </section>
      ) : null}

      {r.receipt ? (
        <footer className="receipt">
          <span>קוד: <bdi>{r.receipt.code}</bdi></span>
          <CopyLink token={r.receipt.token} />
          <span>גרסת נתונים: <bdi>{r.debug.datasetVersion}</bdi></span>
        </footer>
      ) : null}

      <details className="debug">
        <summary>פרטים טכניים</summary>
        <pre dir="ltr">{JSON.stringify({ rid: r.rid, plan: r.plan, failure: r.failure, simulate: r.debug.simulate, datasetVersion: r.debug.datasetVersion, stages: r.debug.stages }, null, 2)}</pre>
      </details>
    </article>
  );
}
