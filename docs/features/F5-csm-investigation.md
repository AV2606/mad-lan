# F5: CSM mode (complaint investigation and reply draft)

**Goal:** a CSM gets "this number is wrong" from a customer. In under 2 minutes, without an engineer, they should know what the customer saw, why the app showed it, the most likely reason for the disagreement, and have a reply to send.

## Page: `/csm` (Hebrew, RTL)

Inputs:
1. **Receipt link or code.** The link replays the exact plan. A bare code (`R-7F3K2A`) can't be replayed without storage; the page explains that and asks for the link (the customer can copy it from the answer page).
2. **Customer's message**, pasted as-is.

Output:
1. **What the customer saw:** the replayed answer (same card as F4, compact).
2. **Automatic checks** (deterministic, listed before any LLM output):
   | Check | Applies when |
   |---|---|
   | `small_sample` | n < 8 |
   | `widened_area` | level L3/L4 |
   | `old_deals_included` | dateFrom more than 3 years before the latest deal in the dataset |
   | `outliers_excluded` | excluded list contains `outlier_price` |
   | `conflicting_sources` | a used deal had a `conflicting_duplicate` twin |
   | `mixed_types` | type filter was null |
   | `data_changed` | receipt version ≠ current |
   | `customer_deal_in_data` / `not_in_data` | deals matching numbers/date/street from the complaint (see below) |
3. **Likely explanation + reply draft** (LLM #3), clearly labeled as a draft for the CSM to edit.
4. **"When to escalate to R&D"** box: shown if the LLM picks `possible_bug`, or checks find nothing.

## Finding the customer's deal

The LLM extracts the customer's claim (`claimedPriceNis`, `claimedDate`, `claimedStreet`, `claimedSizeSqm`). Code then searches the area's deals, **including excluded ones**, for a match (price within 3%, or same street + month). This distinguishes:
- "Your deal isn't in our data" (common and honest)
- "Your deal is in the data but was excluded because…" (e.g. conflicting broker record)
- "Your deal is in the data and was used" (then the range is explained by the other deals)

## LLM #3: investigate

- Input: replay facts, automatic check results, matched deals, complaint text.
- Output (strict schema):
  ```ts
  {
    claim: { priceNis: number|null; date: string|null; street: string|null; sizeSqm: number|null };
    causes: Cause[];                 // must be a subset of checks that applied + "customer_misunderstanding" | "possible_bug" | "no_issue_found"
    explanationForCsm: string;       // Hebrew, 2–4 sentences, internal tone
    replyToCustomer: string;         // Hebrew, polite, no blame, no promises, says what the number is based on
    escalate: boolean;
  }
  ```
- Code checks: causes ⊆ allowed set (else drop invalid ones and log); number guard on both texts (allowed = facts + numbers from complaint).
- On any LLM failure: show the automatic checks + a **template reply** assembled from the checks that applied. The CSM still gets something useful.

## Reply rules (in the prompt)

- Acknowledge the customer, say what the number is based on (n deals, area, dates), and name the specific likely reason.
- Never say the customer is wrong; never promise a fix or a date.
- If the deal isn't in the data: say so plainly, and offer to pass it on.
- Plain Hebrew, ≤ 6 sentences, no technical terms (no "median" → "המחיר האמצעי", the middle price).

## Tests

- Check functions against fixtures (each check true/false)
- Deal matching: exact price hit, 3% tolerance, excluded deal found with its reason
- causes outside the allowed set are dropped
- LLM down → template reply contains the checks that applied (Hebrew snapshot)
