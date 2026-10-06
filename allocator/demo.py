"""Synthetic data at the real scale of a project period, so the allocator can be
tried and demonstrated without touching a single real student record.

The shape mirrors P6 2024-25: about 80 projects, about 550 students, a long
tail of unpopular projects and a few that everyone wants.
"""
from __future__ import annotations

import csv
import random
from pathlib import Path

from .model import LAB_COLUMNS, Project, Student

TOPICS = [
    "Ladybird alkaloid defence", "Remote telescope observations", "Cloud chamber for particle detection",
    "Bryophytes of the Stadspark", "Physics of racket sports", "Microplastics in the Jeker",
    "CRISPR knock-outs in E. coli", "Solar panel yield modelling", "Moth biodiversity in Maastricht",
    "Interactive chemistry simulations", "Metabolic network reconstruction", "Varnish chemistry of old masters",
    "Isopods in winter and summer", "Lunar ejecta hazards", "Locust looming stimuli", "Fossil dwarfs and giants",
    "Mars habitat design", "Muon flux asymmetry", "Nest boxes for the common swift", "Dendrology for the arboretum",
    "Sugar content of local fruit", "Gene editing safety review", "Kaggle challenge at MSP", "Ferns of Limburg",
    "Radiation detection with phones", "Three-body dynamics", "Nylon degradation enzymes", "Rocket spirals",
    "Book materiality and conservation", "Chemistry of dimorphism", "Augmented reality bonding models",
    "Thistle aphids and ants", "Experimental archaeology", "Via Belgica mapping", "Wifi radar", "Cats at the campus",
    "Rainbow optics", "Quasicrystal ferromagnetism", "Sardinia field ecology", "Forest pathology",
]
ADJ = ["Measuring", "Modelling", "Mapping", "Testing", "Designing", "Reviewing", "Comparing", "Building"]
LABS = ["BIO", "ML1", "BIOCHEM", "Chem", "PHYsics", "PBL room", "DRY labs"]
FIRST = ["Anna", "Luca", "Mila", "Noah", "Sara", "Tom", "Julia", "Max", "Emma", "Finn", "Lena", "Omar",
         "Isa", "Jonas", "Nina", "Pedro", "Zoe", "Ben", "Clara", "Yusuf"]
LAST = ["Jansen", "de Vries", "Bakker", "Visser", "Smit", "Meyer", "Fischer", "Rossi", "Novak", "Dubois",
        "Garcia", "Petrov", "Schmidt", "Larsen", "Moreau", "Silva", "Kowalski", "Nagy", "Murphy", "Costa"]


def make_projects(n_1000=20, n_2000=35, n_3000=25, n_slp=8, n_external=4, seed=1) -> list[Project]:
    rng = random.Random(seed)
    out = []
    counter = {"1000": 100, "2000": 200, "3000": 300}
    used = set()
    specs = [("1000", n_1000), ("2000", n_2000), ("3000", n_3000)]
    for level, n in specs:
        for _ in range(n):
            counter[level] += 1
            code = str(counter[level])
            title = f"{rng.choice(ADJ)} {rng.choice(TOPICS).lower()}"
            while title in used:                       # titles must be unique (no-repeat rule keys on them)
                title = f"{rng.choice(ADJ)} {rng.choice(TOPICS).lower()}"
            used.add(title)
            mn = rng.choice([3, 4, 4, 5, 6, 6, 8])
            mx = mn + rng.choice([2, 4, 4, 6, 6, 8, 12])
            sup = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            lab = rng.random() < 0.55
            labs = {rng.choice(LABS): "X"} if lab else {"PBL room": "X"}
            out.append(Project(
                code=code, title=title, level=level, min_students=mn, max_students=mx,
                supervisor=sup, supervisor_email=f"{sup.lower().replace(' ', '.')}@maastrichtuniversity.nl",
                location="DUB30" if lab else "PHS", labs=labs,
                equipment="fume hood, rotavap" if lab and rng.random() < 0.4 else "",
                fume_hoods="1" if lab and rng.random() < 0.5 else "",
            ))
    # some 3000-level projects are student-led, some are external
    for p in rng.sample([p for p in out if p.level == "3000"], n_slp):
        p.slp_leaders = f"{rng.choice(FIRST)} {rng.choice(LAST)}, {rng.choice(FIRST)} {rng.choice(LAST)}"
        p.code = str(int(p.code) + 50)          # the 35x codes ESD uses for SLPs
    for p in rng.sample([p for p in out if p.level != "1000" and not p.slp_leaders], n_external):
        p.external = True
        p.supervisor_email = p.supervisor_email.replace("maastrichtuniversity.nl", "mumc.nl")
        p.location = "MUMC"
    return sorted(out, key=lambda p: p.code)


def make_students(n_1000=200, n_upper=350, seed=1) -> list[Student]:
    rng = random.Random(seed + 7)
    out = []
    sid = 6400000
    for i in range(n_1000 + n_upper):
        sid += rng.randint(3, 40)
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        email = f"{name.lower().replace(' ', '.')}.{sid % 100}@student.maastrichtuniversity.nl"
        if i < n_1000:
            out.append(Student(str(sid), name, email, "1000"))
        else:
            c2, c3 = rng.choice([0, 0, 1, 1, 2]), rng.choice([0, 0, 0, 1, 1, 2])
            needs = c3 == 0 and rng.random() < 0.25
            out.append(Student(str(sid), name, email, "upper", c2, c3, needs))
    return out


def make_preferences(projects, students, seed=1, response_rate=0.93, opt_out=0.04):
    """Top-five choices with a popularity skew: a few projects attract everyone."""
    rng = random.Random(seed + 13)
    by_level = {}
    for p in projects:
        by_level.setdefault(p.level, []).append(p)
    weight = {p.code: rng.paretovariate(1.2) for p in projects}
    rows = []
    for s in students:
        if rng.random() > response_rate:
            continue
        if rng.random() < opt_out:
            rows.append([s.id, s.name, "No", "", "", "", "", ""])
            continue
        pool = [p for lvl in s.eligible_levels() for p in by_level.get(lvl, [])]
        if s.needs_3000 and rng.random() < 0.3:        # some students ignore the rule and list 2000s
            pool += by_level.get("2000", [])
        choices = []
        while len(choices) < 5 and len(choices) < len(pool):
            p = rng.choices(pool, weights=[weight[q.code] for q in pool])[0]
            if p.code not in choices:
                choices.append(p.code)
        rows.append([s.id, s.name, "Yes", *[f"{c}. {next(p.title for p in projects if p.code == c)}" for c in choices]])
    return rows


def write_demo_inputs(out_dir, seed=1, n_students=550, n_projects=80):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    scale = n_projects / 80
    projects = make_projects(round(20 * scale), round(35 * scale), round(25 * scale), seed=seed)
    n_1000 = round(n_students * 200 / 550)
    students = make_students(n_1000, n_students - n_1000, seed=seed)
    prefs = make_preferences(projects, students, seed=seed)

    # bible in the ESD layout (so the demo also exercises the reader)
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["Level", "Course Code", "Project title", "Supervisor name ", "Supervisor e-mail", "SLP",
               "2nd (co-)supervisor (OR STUDENT LED)", "Co-supervisor e-mail", "min", "max",
               "actual nr (for educations settlement)", "lab/ non-lab-based", *LAB_COLUMNS, "equipment",
               "Fume hoods", "Remarks", "external"])
    for p in projects:
        ws.append([p.level, int(p.code), p.title, p.supervisor, p.supervisor_email, p.slp_leaders, p.co_supervisor,
                   p.co_supervisor_email, p.min_students, p.max_students, None, p.location,
                   *[p.labs.get(l, "") for l in LAB_COLUMNS], p.equipment, p.fume_hoods, "", "yes" if p.external else ""])
    wb.save(out / "bible.xlsx")

    # Qualtrics-style export with its three header rows
    with open(out / "preferences.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["End Date", "Student ID (no i)", "Student Name", "I will take a project in period 6",
                    "First choice:", "Second choice:", "Third choice:", "Fourth choice:", "Fifth choice:"])
        w.writerow(["EndDate", "Q2", "Q3", "Q4", "Q5", "Q11", "Q12", "Q13", "Q14"])
        w.writerow(['{"ImportId":"endDate"}', '{"ImportId":"QID2"}', '{"ImportId":"QID3"}', '{"ImportId":"QID4"}',
                    '{"ImportId":"QID5"}', '{"ImportId":"QID11"}', '{"ImportId":"QID12"}', '{"ImportId":"QID13"}',
                    '{"ImportId":"QID14"}'])
        for r in prefs:
            w.writerow(["2027-03-12 10:00:00", *r])

    with open(out / "students.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["student_id", "name", "email", "batch", "completed_2000", "completed_3000", "needs_3000",
                    "done_titles", "notes"])
        for s in students:
            w.writerow([s.id, s.name, s.email, s.batch, s.completed_2000, s.completed_3000,
                        "yes" if s.needs_3000 else "", "|".join(s.done_titles), s.notes])

    # a couple of overrides, the way the committee would write them
    slp = [p for p in projects if p.is_slp]
    with open(out / "overrides.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["action", "student_id", "code", "value"])
        uppers = [s for s in students if s.batch == "upper"]
        for p, s in zip(slp[:3], uppers[:3]):
            w.writerow(["pin", s.id, p.code, ""])
        w.writerow(["max", projects[-1].code, "", str(projects[-1].max_students + 4)])
    return out
