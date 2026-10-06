"use client";

import { useState } from "react";
import { CITIES, NEIGHBORHOODS } from "@/lib/plan";
import type { QueryPlan } from "@/lib/plan";
import { PROPERTY_TYPES } from "@/lib/types";

/** The no-AI path: builds a plan directly. Always reachable, and opened automatically when the model fails. */
export function ManualForm({
  onSubmit, disabled,
}: {
  onSubmit: (plan: QueryPlan) => void;
  disabled: boolean;
}) {
  const [city, setCity] = useState("");
  const [hood, setHood] = useState("");
  const [type, setType] = useState("");
  const [rooms, setRooms] = useState("");
  const [size, setSize] = useState("");
  const [asking, setAsking] = useState("");

  const numOrNull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!city) return;
    const sizeSqm = numOrNull(size);
    const askingPriceNis = numOrNull(asking);
    onSubmit({
      intent: sizeSqm !== null || askingPriceNis !== null ? "estimate" : "area_stats",
      areas: [{ city, neighborhood: hood || null }],
      propertyType: (type || null) as QueryPlan["propertyType"],
      rooms: numOrNull(rooms),
      sizeSqm,
      askingPriceNis,
      unsupportedReason: null,
      mentionedPlace: null,
      clarifyQuestion: null,
    });
  }

  return (
    <form id="manual-form" className="manual" onSubmit={submit}>
      <label id="manual-city-label">
        עיר
        <select id="manual-city-select" value={city} onChange={(e) => { setCity(e.target.value); setHood(""); }} required>
          <option id="manual-city-placeholder-option" value="">בחרו עיר</option>
          {CITIES.map((c, i) => <option key={c} id={`manual-city-option-${i + 1}`}>{c}</option>)}
        </select>
      </label>
      <label id="manual-neighborhood-label">
        שכונה (אופציונלי)
        <select id="manual-neighborhood-select" value={hood} onChange={(e) => setHood(e.target.value)} disabled={!city}>
          <option id="manual-neighborhood-all-option" value="">כל העיר</option>
          {(NEIGHBORHOODS[city] ?? []).map((n, i) => <option key={n} id={`manual-neighborhood-option-${i + 1}`}>{n}</option>)}
        </select>
      </label>
      <label id="manual-type-label">
        סוג נכס
        <select id="manual-type-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option id="manual-type-all-option" value="">הכול</option>
          {PROPERTY_TYPES.map((t, i) => <option key={t} id={`manual-type-option-${i + 1}`}>{t}</option>)}
        </select>
      </label>
      <label id="manual-rooms-label">
        חדרים
        <input id="manual-rooms-input" inputMode="decimal" value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="למשל 3.5" />
      </label>
      <label id="manual-size-label">
        שטח במ״ר
        <input id="manual-size-input" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} placeholder="למשל 90" />
      </label>
      <label id="manual-asking-label">
        מחיר מבוקש בש״ח
        <input id="manual-asking-input" inputMode="numeric" value={asking} onChange={(e) => setAsking(e.target.value)} placeholder="למשל 4200000" />
      </label>
      <button id="manual-submit-button" type="submit" disabled={disabled || !city}>חשב</button>
    </form>
  );
}
