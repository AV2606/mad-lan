import type { DealSummary } from "@/lib/comps";
import { fmtInt, fmtMonth } from "@/lib/facts";
import { FLAG_META } from "@/lib/flags";
import type { Flag } from "@/lib/types";

const WARNING_FLAGS = new Set<Flag>([
  "garden_high_floor", "penthouse_not_top", "new_but_old", "deal_before_built", "tiny_duplex", "missing_size",
]);
const INFO_FLAGS = new Set<Flag>(["month_only_date", "ppsqm_mismatch", "missing_neighborhood"]);

const fmtDate = (d: DealSummary) => (d.datePrecision === "month" ? fmtMonth(d.date) : d.date.split("-").reverse().join("/"));

/** Flags worth showing next to a deal in the "used" table (exclusion flags are shown in their own list). */
function FlagIcons({ flags }: { flags: Flag[] }) {
  const shown = flags.filter((f) => WARNING_FLAGS.has(f) || INFO_FLAGS.has(f));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((f) => (
        <span key={f} className={WARNING_FLAGS.has(f) ? "flag flag-warn" : "flag flag-info"} title={FLAG_META[f].labelHe} aria-label={FLAG_META[f].labelHe}>
          {WARNING_FLAGS.has(f) ? "⚠" : "ⓘ"}
        </span>
      ))}
    </>
  );
}

export function DealsTable({ deals }: { deals: DealSummary[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>מזהה</th><th>תאריך</th><th>שכונה</th><th>סוג</th><th>חדרים</th><th>מ״ר</th><th>מחיר</th><th>₪ למ״ר</th><th>מקור</th><th></th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={`${d.id}-${d.source}-${d.priceNis}`}>
              <td><bdi>{d.id}</bdi></td>
              <td><bdi>{fmtDate(d)}</bdi></td>
              <td>{d.neighborhood ?? "—"}</td>
              <td>{d.type}</td>
              <td><bdi>{d.rooms ?? "—"}</bdi></td>
              <td><bdi>{d.sizeSqm ?? "—"}</bdi></td>
              <td><bdi>{d.priceNis === null ? "—" : fmtInt(d.priceNis)}</bdi></td>
              <td><bdi>{d.pricePerSqm === null ? "—" : fmtInt(d.pricePerSqm)}</bdi></td>
              <td>{d.source}</td>
              <td><FlagIcons flags={d.flags} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExcludedList({ items }: { items: { deal: DealSummary; reason: Flag }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="excluded">
      <h4>מה לא נכלל ולמה</h4>
      <ul>
        {items.map(({ deal: d, reason }) => (
          <li key={`${d.id}-${d.source}-${d.priceNis}`}>
            <bdi>{d.id}</bdi> · {d.neighborhood ?? d.city} · {d.type}
            {d.sizeSqm ? <> · <bdi>{d.sizeSqm}</bdi> מ״ר</> : null}
            {d.priceNis !== null ? <> · <bdi>{fmtInt(d.priceNis)} ₪</bdi> ({d.source})</> : null}
            <br />
            <strong>{FLAG_META[reason].labelHe}.</strong>{" "}
            {reason === "conflicting_duplicate" && d.keptPriceNis !== undefined
              ? <>השתמשנו במחיר <bdi>{fmtInt(d.keptPriceNis)} ₪</bdi> מהמקור האמין יותר.</>
              : FLAG_META[reason].explanationHe}
          </li>
        ))}
      </ul>
    </div>
  );
}
