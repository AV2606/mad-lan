# AI prompts log (raw, auto-appended)

Every prompt sent to the AI assistant, appended by `.claude/hooks/log-prompt.mjs`.
The curated story (what worked, what went wrong) is in [AI_LOG.md](AI_LOG.md).

The first two entries were backfilled by hand, because the hook was created during the second prompt.

---

### 2026-09-29 (backfilled) · session `initial`

> i am a software engeineer
> i have 4 years of experience
> ive got an home assignment from madlan in israel
> i am interviewing for them
> read the data (which should be dirty) and the assignment and suggest a unique solution
> this is a project that is already connected to vercel to be served
>
> (attached: madlan_deals_sample.csv, madlan_rnd_ops_engineer_challenge.md)

---

### 2026-09-29 (backfilled) · session `initial`

> plan the project, write its features in a dedicated files
> also for this project add a log of all my ai queries
> create a file of testing cases for me as a user
> dont use claude since i want this to be relatively easy and cheap for me to do (i have already a groq subscription)
> dont keep room for changes and future development as normally done in production grade code when this will accelerate development
> document your dilemas

---

### 2026-09-29 13:00:44 UTC · session `00038520`

> start implementing the project
> make sure to ask everything when not sure
> see dilemas.md file to guide you

---

### 2026-09-30 19:23:51 UTC · session `00038520`

> i added some fixes needed
> mentioned them in the user test cases md
> fix them (should be very small changes)
> prompt me if anything is yet to be done

---

### 2026-09-30 19:29:21 UTC · session `00038520`

> f1b isnt fixed the text is still שירות הניסוח לא ענה בזמן. הנה המספרים עם הסבר אוטומטי. but there are no numbers
> use different message for the case where a manual search is given

---

### 2026-09-30 19:34:54 UTC · session `00038520`

> as i see again the requierments its seems that we left out a guide page for the csm
> please include one even tho the app is very easy to use, include screenshots, if you cant leave placeholders for me to add
