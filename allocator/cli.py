"""Command line.

    python -m allocator demo --out demo_out
    python -m allocator check --projects bible.xlsx --preferences prefs.csv [--students students.csv]
    python -m allocator allocate --projects bible.xlsx --preferences prefs.csv --students students.csv \
                                 --out out/ [--overrides overrides.csv] [--seed 1] [--year 2026 --session 600]

Preferences can be given more than once with a batch label when ESD runs the
two Qualtrics forms: --preferences 1000=prefs_1000.csv --preferences upper=prefs_upper.csv
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .demo import write_demo_inputs
from .model import Overrides
from .outputs import write_all
from .readers import (read_overrides, read_preferences, read_projects, read_students,
                      students_from_preferences, dump_json)
from .solver import format_summary, solve, summarise


def _load(args):
    projects = read_projects(args.projects)
    prefs, batch_of = [], {}
    for item in args.preferences:
        batch, _, path = item.rpartition("=")
        batch = batch or "upper"
        rows = read_preferences(path, projects)
        for p in rows:
            batch_of[p.student_id] = batch
        prefs += rows
    if args.students:
        students = read_students(args.students)
    else:
        students = []
        for p in prefs:
            students += students_from_preferences([p], batch_of.get(p.student_id, "upper"))
    overrides = read_overrides(args.overrides) if getattr(args, "overrides", None) else Overrides()
    for code in (getattr(args, "close", None) or []):
        overrides.closed.add(code)
    for spec in (getattr(args, "pin", None) or []):
        sid, _, code = spec.partition("=")
        overrides.pins[sid.strip()] = code.strip()
    for spec in (getattr(args, "max", None) or []):
        code, _, n = spec.partition("=")
        overrides.max_override[code.strip()] = int(n)
    return projects, students, prefs, overrides


def cmd_check(args) -> int:
    projects, students, prefs, overrides = _load(args)
    ids = {s.id for s in students}
    pref_ids = {p.student_id for p in prefs}
    codes = {p.code for p in projects}
    print(f"projects: {len(projects)}  (open {sum(p.status == 'open' for p in projects)}, "
          f"1000: {sum(p.level == '1000' for p in projects)}, 2000: {sum(p.level == '2000' for p in projects)}, "
          f"3000: {sum(p.level == '3000' for p in projects)}, SLP: {sum(p.is_slp for p in projects)}, "
          f"external: {sum(p.external for p in projects)})")
    print(f"students: {len(students)}  preferences: {len(prefs)}  "
          f"students without a form: {len(ids - pref_ids)}  forms from students not in the target group: {len(pref_ids - ids)}")
    cap = {lvl: sum(p.max_students for p in projects if p.level == lvl and p.status == 'open') for lvl in ("1000", "2000", "3000")}
    need_1000 = sum(s.batch == "1000" for s in students)
    need_upper = len(students) - need_1000
    print(f"capacity (sum of max): 1000-level {cap['1000']} for {need_1000} students; "
          f"2000+3000-level {cap['2000'] + cap['3000']} for {need_upper} students")
    problems = [p for p in projects if p.max_students < p.min_students]
    for p in problems:
        print(f"  ! project {p.code}: max {p.max_students} < min {p.min_students}")
    missing = sorted(pref_ids - ids)
    if missing:
        print("  forms from unknown students (not in target group): " + ", ".join(missing[:30]) + (" ..." if len(missing) > 30 else ""))
    bad = [(p.student_id, c) for p in prefs for c in p.choices if c not in codes]
    if bad:
        print(f"  ! {len(bad)} choices refer to unknown project codes, e.g. {bad[:5]}")
    for sid, code in overrides.pins.items():
        if sid not in ids:
            print(f"  ! pin for unknown student {sid}")
        if code not in codes:
            print(f"  ! pin to unknown project {code}")
    return 0


def cmd_allocate(args) -> int:
    projects, students, prefs, overrides = _load(args)
    result = solve(projects, students, prefs, overrides, allow_unlisted=args.unlisted, seed=args.seed,
                   time_limit=args.time_limit)
    summary = summarise(result, projects, students, prefs)
    print(format_summary(summary, projects))
    if result.status.startswith("infeasible"):
        return 2
    files = write_all(result, projects, students, prefs, args.out, year=args.year, session=args.session)
    dump_json({"summary": summary, "assignments": [a.__dict__ for a in result.assignments]},
              Path(args.out) / "allocation.json")
    print(f"\nwritten to {args.out}:")
    for f in files:
        print("  " + f)
    return 0


def cmd_demo(args) -> int:
    inp = write_demo_inputs(Path(args.out) / "input", seed=args.seed, n_students=args.students, n_projects=args.projects)
    print(f"synthetic inputs written to {inp}")
    ns = argparse.Namespace(projects=str(inp / "bible.xlsx"), preferences=[f"upper={inp / 'preferences.csv'}"],
                            students=str(inp / "students.csv"), overrides=str(inp / "overrides.csv"),
                            out=str(Path(args.out) / "output"), seed=args.seed, unlisted="all",
                            time_limit=120.0, year="2026", session="600", close=None, pin=None, max=None)
    return cmd_allocate(ns)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="allocator", description="MSP project period allocation")
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("demo", help="generate synthetic data at real scale and allocate it")
    d.add_argument("--out", default="demo_out")
    d.add_argument("--seed", type=int, default=1)
    d.add_argument("--students", type=int, default=550)
    d.add_argument("--projects", type=int, default=80)
    d.set_defaults(func=cmd_demo)

    for name, fn in (("check", cmd_check), ("allocate", cmd_allocate)):
        p = sub.add_parser(name)
        p.add_argument("--projects", required=True, help="the bible workbook (xlsx) or a clean projects CSV")
        p.add_argument("--preferences", action="append", required=True,
                       help="Qualtrics export or clean CSV; prefix with a batch: 1000=file.csv or upper=file.csv")
        p.add_argument("--students", help="target group CSV (id, name, email, batch, completed_2000, completed_3000, needs_3000, done_titles)")
        p.add_argument("--overrides", help="CSV of committee overrides (action, student_id, code, value)")
        p.add_argument("--close", action="append", help="project code to close (repeatable)")
        p.add_argument("--pin", action="append", help="student=code (repeatable)")
        p.add_argument("--max", action="append", help="code=n raise a project's maximum (repeatable)")
        p.set_defaults(func=fn)
    a = sub.choices["allocate"]
    a.add_argument("--out", required=True)
    a.add_argument("--seed", type=int, default=1)
    a.add_argument("--unlisted", choices=["all", "nonresponders", "none"], default="all")
    a.add_argument("--time-limit", type=float, default=120.0)
    a.add_argument("--year", default="", help="SAP year, e.g. 2026")
    a.add_argument("--session", default="", help="SAP period code: 300 = P3, 600 = P6")

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
