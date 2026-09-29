# F6: Data-quality page ("מה אנחנו יודעים על הנתונים")

**Goal:** one page that anyone (customer, CSM, interviewer) can read to see how the raw data was treated. It's static, rendered from `quality-report.json`.

## Page: `/data`

1. **Summary line:** "מתוך X שורות: Y עסקאות ייחודיות, Z שימשו לחישובים" (out of X rows: Y unique deals, Z used in calculations), plus the date range and dataset version.
2. **Issues table:** one row per flag: plain-Hebrew name, count, what we did (removed / excluded from calculations / kept with a warning), and an expandable list of deal IDs.
3. **Assumptions** (short Hebrew list, mirrors DILEMMAS): DD/MM dates, tax authority beats broker, no time adjustment, minimum 5 deals, median not average.
4. **Coverage table:** deals and neighborhoods per city, so users see up front that most neighborhoods are thin.
5. **What's not in the data:** rents, asking prices, exact location, and a price index.

Linked from the footer of every page and from the "על מה זה מבוסס" (what this is based on) section.

## Tests

None beyond F1 (the report is F1's output). Manual check in USER_TEST_CASES.
