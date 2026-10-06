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
function FlagIcons({ flags, idPrefix }: { flags: Flag[]; idPrefix: string }) {
  const shown = flags.filter((f) => WARNING_FLAGS.has(f) || INFO_FLAGS.has(f));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((f) => (
        <span key={f} id={`${idPrefix}-${f}`} className={WARNING_FLAGS.has(f) ? "flag flag-warn" : "flag flag-info"} title={FLAG_META[f].labelHe} aria-label={FLAG_META[f].labelHe}>
          {WARNING_FLAGS.has(f) ? "⚠" : "ⓘ"}
        </span>
      ))}
    </>
  );
}

export function DealsTable({ deals, idPrefix = "deals" }: { deals: DealSummary[]; idPrefix?: string }) {
  return (
    <div id={`${idPrefix}-table-scroll`} className="table-scroll">
      <table id={`${idPrefix}-table`}>
        <thead id={`${idPrefix}-table-head`}>
          <tr id={`${idPrefix}-table-head-row`}>
            <th id={`${idPrefix}-th-id`}>מזהה</th><th id={`${idPrefix}-th-date`}>תאריך</th><th id={`${idPrefix}-th-neighborhood`}>שכונה</th><th id={`${idPrefix}-th-type`}>סוג</th><th id={`${idPrefix}-th-rooms`}>חדרים</th><th id={`${idPrefix}-th-size`}>מ״ר</th><th id={`${idPrefix}-th-price`}>מחיר</th><th id={`${idPrefix}-th-price-per-sqm`}>₪ למ״ר</th><th id={`${idPrefix}-th-source`}>מקור</th><th id={`${idPrefix}-th-flags`}></th>
          </tr>
        </thead>
        <tbody id={`${idPrefix}-table-body`}>
          {deals.map((d, i) => {
            const row = `${idPrefix}-row-${i + 1}`;
            return (
              <tr key={`${d.id}-${d.source}-${d.priceNis}`} id={row}>
                <td id={`${row}-id`}><bdi>{d.id}</bdi></td>
                <td id={`${row}-date`}><bdi>{fmtDate(d)}</bdi></td>
                <td id={`${row}-neighborhood`}>{d.neighborhood ?? "—"}</td>
                <td id={`${row}-type`}>{d.type}</td>
                <td id={`${row}-rooms`}><bdi>{d.rooms ?? "—"}</bdi></td>
                <td id={`${row}-size`}><bdi>{d.sizeSqm ?? "—"}</bdi></td>
                <td id={`${row}-price`}><bdi>{d.priceNis === null ? "—" : fmtInt(d.priceNis)}</bdi></td>
                <td id={`${row}-price-per-sqm`}><bdi>{d.pricePerSqm === null ? "—" : fmtInt(d.pricePerSqm)}</bdi></td>
                <td id={`${row}-source`}>{d.source}</td>
                <td id={`${row}-flags`}><FlagIcons flags={d.flags} idPrefix={`${row}-flag`} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ExcludedList({ items, idPrefix = "excluded" }: { items: { deal: DealSummary; reason: Flag }[]; idPrefix?: string }) {
  if (items.length === 0) return null;
  return (
    <div id={idPrefix} className="excluded">
      <h4 id={`${idPrefix}-title`}>מה לא נכלל ולמה</h4>
      <ul id={`${idPrefix}-list`}>
        {items.map(({ deal: d, reason }, i) => {
          const item = `${idPrefix}-item-${i + 1}`;
          return (
            <li key={`${d.id}-${d.source}-${d.priceNis}`} id={item}>
              <span id={`${item}-deal`}>
                <bdi>{d.id}</bdi> · {d.neighborhood ?? d.city} · {d.type}
                {d.sizeSqm ? <> · <bdi>{d.sizeSqm}</bdi> מ״ר</> : null}
                {d.priceNis !== null ? <> · <bdi>{fmtInt(d.priceNis)} ₪</bdi> ({d.source})</> : null}
              </span>
              <br />
              <strong id={`${item}-reason`}>{FLAG_META[reason].labelHe}.</strong>{" "}
              <span id={`${item}-explanation`}>
                {reason === "conflicting_duplicate" && d.keptPriceNis !== undefined
                  ? <>השתמשנו במחיר <bdi>{fmtInt(d.keptPriceNis)} ₪</bdi> מהמקור האמין יותר.</>
                  : FLAG_META[reason].explanationHe}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
