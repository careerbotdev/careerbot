# icu-staffing-dashboard

A nurse-to-patient ratio dashboard for hospital inpatient units, built as my capstone for the Google Data Analytics Professional Certificate (finished June 2026).

It answers the question a charge nurse asks every shift: **given the census and acuity on each unit, where are we going to be short, and by how many nurses?**

> **All data in this repo is synthetic.** There is no patient data and no data from any real hospital. The numbers were generated in Google Sheets to look like a realistic month on four units.

## What it shows

- Nurse-to-patient ratio by unit and by shift (07:00–19:00 days, 19:00–07:00 nights)
- Acuity-weighted ratio next to the raw ratio, so a unit with three high-acuity patients doesn't look "fine" just because the headcount works
- Shifts where a unit went over its target ratio, color coded red / yellow / green
- How many extra nurses each unit would have needed per shift to stay at target
- A simple trend of over-ratio shifts across the month

The live dashboard is in Looker Studio (link in `docs/dashboard-link.md`). Screenshots are in `docs/screenshots/`.

## Repo layout

```
data/
  units.csv            # 4 units: ICU, step-down, med-surg, ED hold
  shifts.csv           # 31 days x 2 shifts x 4 units
  census.csv           # patients per unit per shift, with acuity level 1-4
  staffing.csv         # RNs scheduled vs. RNs actually worked per shift
sql/
  01_clean.sql         # trims, fixes the date formats, drops duplicate rows
  02_ratios.sql        # raw and acuity-weighted ratios per unit per shift
  03_gaps.sql          # nurses short vs. target ratio
  04_summary.sql       # monthly rollup used by the dashboard
docs/
  capstone-writeup.md  # the case study for the certificate
  screenshots/
```

## How to run it

You don't need to install anything. Everything runs in free tools.

1. Create a free BigQuery sandbox project in Google Cloud.
2. Make a dataset called `staffing` and upload the four CSVs in `data/` as tables with the same names.
3. Open each file in `sql/` in the BigQuery editor and run them in order (01 → 04). Each one writes a new table into the `staffing` dataset.
4. In Looker Studio, add a data source pointing at `staffing.summary` and `staffing.gaps`.
5. Make a copy of the dashboard from the link in `docs/dashboard-link.md` and swap in your data source.

If you just want to look, the screenshots and the write-up are enough.

## Design notes

**Target ratios.** I used common targets as defaults: ICU 1:2, step-down 1:3, med-surg 1:5, ED hold 1:4. They live in `units.csv` so you can change them without touching the SQL.

**Acuity weighting.** Each patient has an acuity level from 1 (stable) to 4 (unstable, needs 1:1). The weighted census counts a level 4 as 2 patients and a level 3 as 1.5. That's a rough rule I picked from my own charge nurse experience, not a validated acuity tool, and the write-up says so.

**Scheduled vs. worked.** The gap that matters at 4 a.m. is between who was scheduled and who actually showed up, so `staffing.csv` keeps both. The dashboard uses "worked."

**Why Looker Studio.** The course taught Tableau, but Looker Studio connects straight to BigQuery, it's free, and anyone with the link can view it without an account. That mattered for showing it to non-technical people.

**What I'd change.** Real staffing data would come out of a scheduling system, not CSVs, and float nurses would need their own handling. I left float pool out to keep the capstone a reasonable size.

## Status

Done as a capstone (June 2026). I'm not actively adding features. It has never been connected to real hospital data and shouldn't be without the right approvals.

Issues and suggestions are welcome, especially from other nurses who've had to staff a unit off a whiteboard.

## License

MIT
