"""Run with:  python -m unittest discover -s allocator/tests -v"""
import tempfile
import time
import unittest
from pathlib import Path

from allocator.demo import make_preferences, make_projects, make_students, write_demo_inputs
from allocator.model import Overrides, Preference, Project, Student
from allocator.readers import read_overrides, read_preferences, read_projects, read_students
from allocator.solver import solve, summarise


def P(code, level, mn, mx, **kw):
    return Project(code=code, title=f"Project {code}", level=level, min_students=mn, max_students=mx, **kw)


def S(i, batch="upper", **kw):
    return Student(id=str(6400000 + i), name=f"Student {i}", batch=batch, **kw)


class SolverRules(unittest.TestCase):
    def test_everyone_placed_and_capacity_respected(self):
        projects = [P("201", "2000", 2, 3), P("202", "2000", 2, 3), P("203", "2000", 2, 3)]
        students = [S(i) for i in range(8)]
        prefs = [Preference(s.id, ["201", "202", "203"]) for s in students]
        r = solve(projects, students, prefs, seed=3)
        self.assertEqual(r.unassigned, [])
        for code, n in r.counts.items():
            self.assertLessEqual(n, 3)
            self.assertGreaterEqual(n, 2)

    def test_project_below_minimum_does_not_run(self):
        projects = [P("201", "2000", 4, 8), P("202", "2000", 1, 8)]
        students = [S(i) for i in range(3)]
        prefs = [Preference(s.id, ["201", "202"]) for s in students]
        r = solve(projects, students, prefs)
        self.assertIn("201", r.closed)
        self.assertEqual(r.counts.get("202"), 3)

    def test_pin_and_forbid(self):
        projects = [P("201", "2000", 1, 5), P("202", "2000", 1, 5)]
        students = [S(0), S(1)]
        prefs = [Preference(students[0].id, ["201"]), Preference(students[1].id, ["201"])]
        ov = Overrides(pins={students[0].id: "202"}, forbids={(students[1].id, "201")})
        r = solve(projects, students, prefs, ov)
        by = r.by_student()
        self.assertEqual(by[students[0].id].code, "202")
        self.assertEqual(by[students[0].id].reason, "pinned")
        self.assertEqual(by[students[1].id].code, "202")       # forbidden from 201, lands unlisted
        self.assertTrue(by[students[1].id].reason.startswith("unlisted"))

    def test_level_eligibility(self):
        projects = [P("101", "1000", 1, 5), P("201", "2000", 1, 5), P("301", "3000", 1, 5)]
        first = S(0, batch="1000")
        upper = S(1)
        final = S(2, needs_3000=True)
        prefs = [Preference(first.id, ["201", "101"]), Preference(upper.id, ["101", "201"]),
                 Preference(final.id, ["201", "301"])]
        r = solve(projects, [first, upper, final], prefs)
        by = r.by_student()
        self.assertEqual(by[first.id].code, "101")
        self.assertEqual(by[upper.id].code, "201")
        self.assertEqual(by[final.id].code, "301")

    def test_no_repeat_of_a_project_already_done(self):
        projects = [P("201", "2000", 1, 5), P("202", "2000", 1, 5)]
        s = S(0, done_titles=["Project 201"])
        r = solve(projects, [s], [Preference(s.id, ["201", "202"])])
        self.assertEqual(r.by_student()[s.id].code, "202")

    def test_opt_out_and_closed_project(self):
        projects = [P("201", "2000", 1, 5), P("202", "2000", 1, 5)]
        a, b = S(0), S(1)
        prefs = [Preference(a.id, ["201"], will_take=False), Preference(b.id, ["201", "202"])]
        r = solve(projects, [a, b], prefs, Overrides(closed={"201"}))
        by = r.by_student()
        self.assertIsNone(by[a.id].code)
        self.assertEqual(by[a.id].reason, "opted out")
        self.assertEqual(by[b.id].code, "202")

    def test_external_project_is_preferred_when_otherwise_equal(self):
        projects = [P("201", "2000", 2, 2, external=True), P("202", "2000", 2, 2)]
        students = [S(0), S(1)]
        prefs = [Preference(s.id, ["201", "202"]) for s in students]
        r = solve(projects, students, prefs)
        self.assertEqual(r.counts.get("201"), 2)

    def test_same_seed_same_result(self):
        projects = make_projects(seed=5)
        students = make_students(60, 90, seed=5)
        rows = make_preferences(projects, students, seed=5)
        prefs = [Preference(r[0], [c.split(".")[0] for c in r[3:] if c], r[2] == "Yes") for r in rows]
        a = solve(projects, students, prefs, seed=11)
        b = solve(projects, students, prefs, seed=11)
        self.assertEqual([x.code for x in a.assignments], [x.code for x in b.assignments])

    def test_full_scale_runs_fast_and_places_nearly_everyone(self):
        projects = make_projects(seed=2)
        students = make_students(200, 350, seed=2)
        rows = make_preferences(projects, students, seed=2)
        prefs = [Preference(r[0], [c.split(".")[0] for c in r[3:] if c], r[2] == "Yes") for r in rows]
        t = time.time()
        r = solve(projects, students, prefs, seed=2)
        self.assertLess(time.time() - t, 60)
        s = summarise(r, projects, students, prefs)
        self.assertEqual(s["histogram"]["unassigned"], 0)
        self.assertGreater(s["top3_share"], 0.8)


class Readers(unittest.TestCase):
    def test_round_trip_through_the_demo_files(self):
        with tempfile.TemporaryDirectory() as d:
            inp = write_demo_inputs(Path(d), seed=4, n_students=120, n_projects=24)
            projects = read_projects(inp / "bible.xlsx")
            self.assertEqual(len(projects), 24)
            self.assertTrue(any(p.is_slp for p in projects))
            self.assertTrue(any(p.external for p in projects))
            prefs = read_preferences(inp / "preferences.csv", projects)
            self.assertGreater(len(prefs), 100)
            self.assertTrue(all(len(p.choices) <= 5 for p in prefs))
            students = read_students(inp / "students.csv")
            self.assertEqual(len(students), 120)
            ov = read_overrides(inp / "overrides.csv")
            self.assertEqual(len(ov.pins), 3)
            r = solve(projects, students, prefs, ov)
            for sid, code in ov.pins.items():
                self.assertEqual(r.by_student()[sid].code, code)

    def test_choice_values_in_every_shape(self):
        projects = [P("201", "2000", 1, 5), P("202", "2000", 1, 5)]
        projects[1].title = "Moth biodiversity in Maastricht"
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "p.csv"
            f.write_text("student_id,name,will_take,choice1,choice2,choice3\n"
                         "6400001,A,yes,201,(202),\n"
                         "6400002,B,yes,\"202. Moth biodiversity in Maastricht\",Moth biodiversity in Maastricht,201\n",
                         encoding="utf-8")
            prefs = {p.student_id: p for p in read_preferences(f, projects)}
            self.assertEqual(prefs["6400001"].choices, ["201", "202"])
            self.assertEqual(prefs["6400002"].choices, ["202", "201"])


if __name__ == "__main__":
    unittest.main()
