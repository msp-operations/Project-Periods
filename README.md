# MSP Project Periods

The tool for the Maastricht Science Programme's **project periods** (P3 in January, P6 in June): staff
offer projects, the Project Committee publishes the catalogue, students submit a top five, the committee
allocates, and the Education Support Department books the result in SAP, Canvas and the labs.

Today that chain is a Word template emailed to msp-projects@, hand-typed into a "bible" spreadsheet,
re-typed into two Qualtrics forms, allocated offline, and re-typed again into SAP. This repository replaces
the re-typing, one link at a time, without touching SAP, Canvas or Feedback Fruits (which stay where they
are and get paste-ready files instead).

**Status (6 Oct 2026): first build.** Nothing is deployed and no real data has been through it. The
allocation engine is complete and tested at full scale on synthetic data; the staff intake and committee
dashboard run in preview mode and need a Supabase project to go live. See *Roadmap* below.

## What is in the box

```
.
├─ allocator/              Python: the allocation engine + every office output (runs locally)
│   ├─ model.py            Project / Student / Preference / Overrides, nothing more
│   ├─ readers.py          reads the ESD bible (xlsx), the Qualtrics export, the target group, overrides
│   ├─ solver.py           the allocation (mixed-integer programme, HiGHS via SciPy)
│   ├─ outputs.py          allocation.xlsx, mail merge, SAP sheets per code, Canvas groups, lab overview,
│   │                      norm hours, updated bible
│   ├─ demo.py             synthetic data at real scale (550 students, 80 projects), no real people
│   ├─ cli.py              python -m allocator demo | check | allocate
│   └─ tests/              11 tests: rules, readers, full-scale run
├─ app/                    The website (plain HTML/CSS/JS, same house style as msp-tutoring.nl)
│   ├─ index.html          the catalogue (replaces the Word booklet)
│   ├─ submit.html         staff project submission form (replaces the Word template by email)
│   ├─ admin.html          committee dashboard: review, codes, publish, exports
│   ├─ assets/config.js    the one file to edit when connecting Supabase
│   ├─ assets/supabase.js  data layer (live Supabase or offline preview)
│   └─ supabase/schema.sql tables, the submit function, Row-Level Security
├─ index.html              root redirect to app/
└─ .github/workflows/      GitHub Pages deploy (inactive while the repo is private)
```

## The allocation engine

```
python -m allocator demo --out demo_out                       # synthetic run, see what it produces
python -m allocator check    --projects bible.xlsx --preferences upper=prefs.csv --students students.csv
python -m allocator allocate --projects bible.xlsx --preferences upper=prefs_upper.csv \
        --preferences 1000=prefs_1000.csv --students students.csv --overrides overrides.csv \
        --out out/ --year 2026 --session 600
python -m unittest discover -s allocator/tests -t . -v
```

Inputs, all of which ESD already produces:

| File | What it is | Where it comes from today |
|---|---|---|
| `bible.xlsx` | one row per project: level, code, title, supervisors, min, max, labs, equipment | ESD's "bible" / "Running projects" workbook, or the dashboard's *Export bible* |
| `prefs.csv` | one row per student: ID, name, will take, first to fifth choice | the Qualtrics export, as is (three header rows are fine) |
| `students.csv` | the target group: ID, name, email, batch (1000 or upper), 2000s and 3000s already passed, needs a 3000, titles already done | ESD's target-group list plus SAP history |
| `overrides.csv` | the committee's manual passes: `pin`, `forbid`, `close`, `max`, `min`, `external` | written by hand after the first run |

Rules the engine enforces, all taken from the committee's own practice (Linnea's 2019 handover, the
syllabus): each student gets one project, a project runs only if it reaches its minimum and never above
its maximum, 1000-batch students only get 1000-level projects, a student who still owes a 3000-level only
gets a 3000-level, nobody repeats a project already done, pinned students stay pinned (student leaders into
their own project), closed projects take nobody, externally supervised projects are preferred, and a
student without a usable choice lands on an MSP-supervised project with space. Costs: choices one to five
cost 0, 1, 3, 6, 10; an unlisted project 40; leaving someone unassigned 1000. Ties break randomly with a
seed, so the same seed reproduces the same allocation.

On the synthetic demo (550 students, 80 projects) it runs in under two seconds, places everyone,
gives 55 percent their first choice and 92 percent one of their top three, and drops eleven projects
that did not reach their minimum. Real preferences are spikier than the demo's, so expect the first-choice
share to be lower and the override round to matter more.

Outputs in `out/`:

- `allocation.xlsx`: every student with project, rank and how they were placed; a sheet per project; the summary; warnings; the unassigned.
- `mail_merge.csv`: one row per running project with supervisor and student emails (the allocation email).
- `sap/PROxxxx.xlsx` and `PROxxxx_ids.txt`: per SAP code (PRO1002, PRO2001, PRO2002, PRO3001, ...), the ID list to paste into the mass booking and the titles wrapped at 45 characters for the individual-work import.
- `canvas_groups.csv`: the group import for the PRO1000 Canvas course.
- `lab_overview.xlsx`: lab-based projects with their lab needs and actual numbers, for the DUB30 coordinators.
- `norm_hours.xlsx` and `bible_updated.xlsx`: the actual numbers per project for the settlement, and the bible with them filled in.

## The website

Open `app/index.html` in a browser and it runs in **preview mode** with sample projects: good enough to
show the committee the flow. To go live:

1. Create a Supabase project (EU region, the "MSP" organisation that hosts the tutoring tool).
2. Run `app/supabase/schema.sql` in the SQL editor, then `insert into admin_user (email) values (...)` for each committee member.
3. Put the project URL and anon key in `app/assets/config.js`.
4. Supabase > Authentication > URL configuration: add the site URL so magic links return to the dashboard.
5. In the dashboard: create the period, switch *accepting submissions* on, send staff the link to `submit.html`.

The public sees approved projects of a published period, which is the same information as the printed
booklet (staff names and UM addresses). Submissions go through one database function; there is no public
insert on the table. Everything else needs a committee login.

## Data rules

- **No student data in this repository, ever.** `.gitignore` refuses spreadsheets and CSVs; real inputs
  and outputs stay on the office drive. The demo generates invented people.
- Student preferences and allocations run **locally** through the allocator. The website holds staff and
  project data only, until MSP management decides where student data may be hosted. Moving the student
  side online later is one more table and one more page; the engine does not change.

## Roadmap

1. **Done:** allocation engine with the committee's rules, all office outputs, staff intake, catalogue,
   committee dashboard with code assignment and exports (bible CSV, printable booklet).
2. **Next:** show Lorenzo Reverberi and Heather Obmann; compare the engine with Lorenzo's tool on a past
   period (same inputs, compare the two allocations); connect Supabase; first real use P6 2027 (staff call
   around 10 February 2027, allocation around 21 March 2027).
3. **Later:** student sign-up in the tool instead of Qualtrics (after the hosting decision); a web view of
   the allocation workbench (pins, closes, rerun) instead of the overrides CSV; grade collection and the
   SAP result sheets.

## Context

The working notes, process description and open questions live outside the repo, in the Operations
folder next to this clone (`_PROJECT_PERIODS_CONTEXT.md`). The process itself is documented in the ESD
tree under *Course Planning & Information / Scheduling P6 (incl. DUB30) / 2024-2025 / Project Management*.
