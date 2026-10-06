"""The allocation itself: students with a top five, projects with a minimum and a
maximum, a few hard rules, solved as a small mixed-integer programme.

Why a solver and not a greedy loop: the committee's own rules interact
(a project only runs if it reaches its minimum, a student must get a 3000-level
if they still owe one, SLP leaders are fixed in their own project, an externally
supervised project is preferred) and a greedy pass gets stuck on the
interactions. HiGHS (bundled with SciPy) solves 550 students x 80 projects in
well under a second and proves the result is the best one for the chosen costs.

Costs (lower is better):
    choice 1..5          0, 1, 3, 6, 10      convex: one student's 5th choice costs
                                             more than two students' 3rd choices
    unlisted project     40                  only for students without a usable choice
    unassigned           1000                the solver avoids this at almost any price
    external project runs  -5                a running externally supervised project
                                             is rewarded ("prioritise externals")
A seeded random jitter below 0.01 breaks ties, so equal students are not
ordered alphabetically. The same seed gives the same allocation.
"""
from __future__ import annotations

import time
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import coo_matrix

from .model import Assignment, Overrides, Result, norm_title

RANK_COST = {1: 0.0, 2: 1.0, 3: 3.0, 4: 6.0, 5: 10.0}
UNLISTED_COST = 40.0
UNASSIGNED_COST = 1000.0
EXTERNAL_BONUS = 5.0


def solve(projects, students, preferences, overrides: Overrides | None = None, *,
          allow_unlisted: str = "all", seed: int = 0, time_limit: float = 120.0,
          rank_cost: dict = RANK_COST, unlisted_cost: float = UNLISTED_COST,
          unassigned_cost: float = UNASSIGNED_COST, external_bonus: float = EXTERNAL_BONUS) -> Result:
    """Allocate students to projects.

    allow_unlisted: "all"  (any student may land on an unlisted, MSP-supervised
                           project when their choices are full, at a high cost),
                    "nonresponders" (only students without a usable preference),
                    "none".
    """
    ov = overrides or Overrides()
    t0 = time.time()
    warnings: list[str] = []
    rng = np.random.default_rng(seed)

    # ---- projects that can run this round -------------------------------
    proj = {}
    for p in projects:
        if p.status == "closed" or p.code in ov.closed:
            continue
        proj[p.code] = p
    codes = list(proj.keys())
    pidx = {c: i for i, c in enumerate(codes)}
    pmin = {c: int(ov.min_override.get(c, proj[c].min_students)) for c in codes}
    pmax = {c: int(ov.max_override.get(c, proj[c].max_students)) for c in codes}
    for c in codes:
        if pmin[c] < 1:
            pmin[c] = 1
        if pmax[c] < pmin[c]:
            warnings.append(f"project {c}: max {pmax[c]} below min {pmin[c]}, max raised to min")
            pmax[c] = pmin[c]
    is_external = {c: (proj[c].external or c in ov.external) for c in codes}

    # ---- students in the model (opted-out students are left out) ---------
    pref = {pr.student_id: pr for pr in preferences}
    model_students = []
    for s in students:
        pr = pref.get(s.id)
        if pr is not None and not pr.will_take:
            continue
        model_students.append(s)
    sidx = {s.id: i for i, s in enumerate(model_students)}

    # ---- candidate pairs --------------------------------------------------
    # each pair: (student index, project code, cost, rank, reason)
    pairs: list[tuple] = []
    pinned_pairs: set[int] = set()
    for s in model_students:
        si = sidx[s.id]
        elig = s.eligible_levels()
        done = {norm_title(t) for t in s.done_titles}
        pr = pref.get(s.id)

        pin = ov.pins.get(s.id)
        if pin is not None:
            if pin in proj:
                pinned_pairs.add(len(pairs))
                pairs.append((si, pin, 0.0, 0, "pinned"))
                continue
            warnings.append(f"student {s.id}: pinned to {pin}, which is not an open project; pin ignored")

        listed = 0
        seen = set()
        if pr is not None:
            for r, code in enumerate(pr.choices, 1):
                if r > 5 or code in seen:
                    continue
                seen.add(code)
                if code not in proj:
                    warnings.append(f"student {s.id}: choice {r} = {code} is not an open project")
                    continue
                p = proj[code]
                if p.level not in elig:
                    warnings.append(f"student {s.id}: choice {r} = {code} is {p.level}-level, student may take {sorted(elig)}")
                    continue
                if (s.id, code) in ov.forbids:
                    continue
                if norm_title(p.title) in done:
                    warnings.append(f"student {s.id}: choice {r} = {code} repeats a project already done")
                    continue
                cost = rank_cost.get(r, 10.0) + rng.uniform(0, 0.01)
                pairs.append((si, code, cost, r, f"choice {r}"))
                listed += 1

        open_to_unlisted = (allow_unlisted == "all") or (allow_unlisted == "nonresponders" and listed == 0)
        if open_to_unlisted:
            reason = "unlisted (no usable choice)" if listed == 0 else "unlisted (choices full)"
            for code in codes:
                p = proj[code]
                if code in seen or p.level not in elig or is_external[code]:
                    continue
                if (s.id, code) in ov.forbids or norm_title(p.title) in done:
                    continue
                pairs.append((si, code, unlisted_cost + rng.uniform(0, 0.01), None, reason))

    n_pairs, n_s, n_p = len(pairs), len(model_students), len(codes)
    n_var = n_pairs + n_s + n_p          # x (pairs) | u (unassigned slack) | y (project runs)
    off_u, off_y = n_pairs, n_pairs + n_s

    # ---- objective ----------------------------------------------------------
    c = np.zeros(n_var)
    for k, (_, _, cost, _, _) in enumerate(pairs):
        c[k] = cost
    c[off_u:off_u + n_s] = unassigned_cost
    for code, j in pidx.items():
        c[off_y + j] = -external_bonus if is_external[code] else 0.0

    # ---- constraints -------------------------------------------------------
    rows, cols, vals, lb, ub = [], [], [], [], []
    r = 0
    # one project (or the slack) per student
    for s in model_students:
        si = sidx[s.id]
        rows.append(r); cols.append(off_u + si); vals.append(1.0)
        lb.append(1.0); ub.append(1.0)
        r += 1
    for k, (si, code, _, _, _) in enumerate(pairs):
        rows.append(si); cols.append(k); vals.append(1.0)
    # capacity: sum x - max*y <= 0 ; minimum: sum x - min*y >= 0
    cap_row = {code: r + pidx[code] for code in codes}
    min_row = {code: r + n_p + pidx[code] for code in codes}
    for code in codes:
        j = pidx[code]
        rows.append(cap_row[code]); cols.append(off_y + j); vals.append(-float(pmax[code]))
        rows.append(min_row[code]); cols.append(off_y + j); vals.append(-float(pmin[code]))
    for k, (si, code, _, _, _) in enumerate(pairs):
        rows.append(cap_row[code]); cols.append(k); vals.append(1.0)
        rows.append(min_row[code]); cols.append(k); vals.append(1.0)
    lb += [-np.inf] * n_p + [0.0] * n_p
    ub += [0.0] * n_p + [np.inf] * n_p
    n_rows = r + 2 * n_p
    A = coo_matrix((vals, (rows, cols)), shape=(n_rows, n_var)).tocsr()

    # ---- bounds ------------------------------------------------------------
    blo = np.zeros(n_var)
    bhi = np.ones(n_var)
    for k in pinned_pairs:
        blo[k] = 1.0

    if n_var == 0:
        return Result([], {}, [], 0.0, "empty", time.time() - t0, warnings)

    res = milp(c, constraints=LinearConstraint(A, np.array(lb), np.array(ub)),
               integrality=np.ones(n_var), bounds=Bounds(blo, bhi),
               options={"time_limit": time_limit, "disp": False})
    if res.x is None:
        return Result([], {}, [], float("nan"), f"infeasible ({res.message})", time.time() - t0,
                      warnings + ["no feasible allocation: check pins against capacities and closed projects"])
    x = np.rint(res.x)

    # ---- read the solution back ---------------------------------------------
    assignments = {s.id: Assignment(s.id, None, None, "unassigned") for s in model_students}
    counts = {code: 0 for code in codes}
    for k, (si, code, _, rank, reason) in enumerate(pairs):
        if x[k] > 0.5:
            s = model_students[si]
            assignments[s.id] = Assignment(s.id, code, rank, reason)
            counts[code] += 1
    for s in students:
        if s.id not in assignments:
            assignments[s.id] = Assignment(s.id, None, None, "opted out")
    running = {code: n for code, n in counts.items() if n > 0}
    closed = [code for code in codes if counts[code] == 0]
    status = "optimal" if res.status == 0 else f"stopped: {res.message}"
    return Result(list(assignments.values()), running, closed, float(res.fun), status,
                  time.time() - t0, warnings)


def summarise(result: Result, projects, students, preferences) -> dict:
    """Numbers the committee looks at first."""
    proj = {p.code: p for p in projects}
    pref = {pr.student_id: pr for pr in preferences}
    hist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, "pinned": 0, "unlisted": 0, "unassigned": 0, "opted out": 0}
    for a in result.assignments:
        if a.reason == "opted out":
            hist["opted out"] += 1
        elif a.code is None:
            hist["unassigned"] += 1
        elif a.rank == 0:
            hist["pinned"] += 1
        elif a.rank is None:
            hist["unlisted"] += 1
        else:
            hist[a.rank] += 1
    placed = sum(hist[r] for r in (1, 2, 3, 4, 5)) + hist["pinned"] + hist["unlisted"]
    top3 = hist[1] + hist[2] + hist[3]
    by_level = {}
    for code, n in result.counts.items():
        lvl = proj[code].level if code in proj else "?"
        d = by_level.setdefault(lvl, {"projects": 0, "students": 0})
        d["projects"] += 1
        d["students"] += n
    responded = sum(1 for s in students if s.id in pref)
    return {
        "students": len(students),
        "responded": responded,
        "placed": placed,
        "top3_share": (top3 / placed) if placed else 0.0,
        "first_choice_share": (hist[1] / placed) if placed else 0.0,
        "histogram": hist,
        "running": len(result.counts),
        "closed": result.closed,
        "by_level": by_level,
        "status": result.status,
        "seconds": result.seconds,
        "warnings": result.warnings,
    }


def format_summary(summary: dict, projects) -> str:
    proj = {p.code: p for p in projects}
    h = summary["histogram"]
    lines = [
        f"Allocation {summary['status']} in {summary['seconds']:.1f}s",
        f"Students in target group: {summary['students']}  responded: {summary['responded']}  placed: {summary['placed']}",
        f"Choice 1: {h[1]}  2: {h[2]}  3: {h[3]}  4: {h[4]}  5: {h[5]}  pinned: {h['pinned']}  unlisted: {h['unlisted']}  unassigned: {h['unassigned']}  opted out: {h['opted out']}",
        f"First choice: {summary['first_choice_share']:.0%}   within top three: {summary['top3_share']:.0%}",
        f"Projects running: {summary['running']}   not running: {len(summary['closed'])}",
    ]
    for lvl in sorted(summary["by_level"]):
        d = summary["by_level"][lvl]
        lines.append(f"  {lvl}-level: {d['projects']} projects, {d['students']} students")
    if summary["closed"]:
        lines.append("Not running (below minimum or closed):")
        for code in summary["closed"]:
            p = proj.get(code)
            lines.append(f"  {code}  {p.title if p else ''}  (min {p.min_students if p else '?'})")
    if summary["warnings"]:
        lines.append(f"Warnings ({len(summary['warnings'])}):")
        lines += [f"  - {w}" for w in summary["warnings"][:60]]
        if len(summary["warnings"]) > 60:
            lines.append(f"  ... and {len(summary['warnings']) - 60} more (see log)")
    return "\n".join(lines)
