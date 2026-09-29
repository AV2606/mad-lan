import { readFileSync, writeFileSync } from "node:fs";
import { buildPlaces, buildReport, cleanDeals, serializeDeals } from "../src/lib/clean";
import { parseCsv } from "../src/lib/csv";

const rows = parseCsv(readFileSync("data/madlan_deals_sample.csv", "utf8"));
const deals = cleanDeals(rows);
const report = buildReport(deals, rows.length);

writeFileSync("src/data/deals.json", serializeDeals(deals));
writeFileSync("src/data/places.json", JSON.stringify(buildPlaces(deals), null, 2) + "\n");
writeFileSync("src/data/quality-report.json", JSON.stringify(report, null, 2) + "\n");

console.log(`rows ${report.rawRows} · unique ${report.uniqueDeals} · usable ${report.usableForStats} · version ${report.datasetVersion}`);
for (const i of report.issues) console.log(`${i.flag.padEnd(24)} ${String(i.count).padStart(3)}  ${i.action}`);
