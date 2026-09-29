"use client";

import { useState } from "react";
import { CITIES, NEIGHBORHOODS } from "@/lib/plan";
import type { QueryPlan } from "@/lib/plan";
import { PROPERTY_TYPES } from "@/lib/types";

/** The no-AI path: builds a plan directly. Always reachable, and opened automatically when the model fails. */
export function ManualForm({
  onSubmit, disabled, prefillCity,
}: {
  onSubmit: (plan: QueryPlan) => void;
  disabled: boolean;
  prefillCity?: string | null;
}) {
  const [city, setCity] = useState(prefillCity && CITIES.includes(prefillCity) ? prefillCity : "");
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
    <form className="manual" onSubmit={submit}>
      <label>
        עיר
        <select value={city} onChange={(e) => { setCity(e.target.value); setHood(""); }} required>
          <option value="">בחרו עיר</option>
          {CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label>
        שכונה (אופציונלי)
        <select value={hood} onChange={(e) => setHood(e.target.value)} disabled={!city}>
          <option value="">כל העיר</option>
          {(NEIGHBORHOODS[city] ?? []).map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <label>
        סוג נכס
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">הכול</option>
          {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label>
        חדרים
        <input inputMode="decimal" value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="למשל 3.5" />
      </label>
      <label>
        שטח במ״ר
        <input inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} placeholder="למשל 90" />
      </label>
      <label>
        מחיר מבוקש בש״ח
        <input inputMode="numeric" value={asking} onChange={(e) => setAsking(e.target.value)} placeholder="למשל 4200000" />
      </label>
      <button type="submit" disabled={disabled || !city}>חשב</button>
    </form>
  );
}
