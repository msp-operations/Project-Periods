"""Readers for the three input files, tolerant of the way ESD actually builds them.

The bible workbook has had slightly different headers every period since 2022
("Supervisor name " with a trailing space, "min" vs "Minimum students",
"2nd (co-)supervisor (OR STUDENT LED)" vs "Cosupervisor name ", a blank column
A in some years). The Qualtrics export carries three header rows. These
readers match headers by meaning, not by exact text, and complain loudly
when something is missing.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from .model import LAB_COLUMNS, Overrides, Preference, Project, Student, norm_title


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _norm_header(h) -> str:
    return re.sub(r"\s+", " ", str(h or "")).strip().lower()


def _rows(path: Path) -> list[list]:
    """Rows of a CSV or the first sheet of an xlsx, as lists of cell values."""
    path = Path(path)
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        try:
            ws = wb.worksheets[0]
            return [list(r) for r in ws.iter_rows(values_only=True)]
        finally:
            wb.close()          # read-only mode keeps the file handle open until closed
    with open(path, encoding="utf-8-sig", newline="") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        return [row for row in csv.reader(fh, dialect)]


def _find(headers: list[str], *needles: str, required=False, exact=False) -> int | None:
    """Index of the first header that contains (or equals) one of the needles."""
    for n in needles:
        for i, h in enumerate(headers):
            if (h == n) if exact else (n in h):
                return i
    if required:
        raise ValueError(f"none of the columns {needles} found in headers {headers}")
    return None


def _cell(row, i):
    if i is None or i >= len(row) or row[i] is None:
        return ""
    v = row[i]
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _int(v, default=0) -> int:
    s = str(v or "").strip()
    m = re.search(r"\d+", s)
    return int(m.group()) if m else default


def _bool(v) -> bool:
    return str(v or "").strip().lower() in ("x", "yes", "y", "true", "1", "ja")


def _code_from(value: str) -> str | None:
    """'203', '203.', '203. Title', '(203)', 'Title (203)' -> '203'."""
    s = str(value or "").strip()
    if not s:
        return None
    m = re.match(r"^\s*(\d{3})(?:\D|$)", s)
    if m:
        return m.group(1)
    m = re.search(r"\((\d{3})\)\s*$", s)
    if m:
        return m.group(1)
    return None


# ---------------------------------------------------------------------------
# projects (the bible)
# ---------------------------------------------------------------------------
def read_projects(path) -> list[Project]:
    rows = _rows(Path(path))
    # the header row is the first row that contains "title"
    hi = next((i for i, r in enumerate(rows) if any("title" in _norm_header(c) for c in r)), None)
    if hi is None:
        raise ValueError(f"{path}: no header row with a 'title' column")
    headers = [_norm_header(c) for c in rows[hi]]
    col = {
        "level": _find(headers, "level"),
        "code": _find(headers, "course code", "project code", "code"),
        "title": _find(headers, "project title", "title", required=True),
        "supervisor": _find(headers, "supervisor name", "supervisor"),
        "supervisor_email": _find(headers, "supervisor e-mail", "supervisor email"),
        "slp": _find(headers, "slp", "student led"),
        "co_supervisor": _find(headers, "2nd (co-)supervisor", "cosupervisor name", "co-supervisor name", "co-supervisor"),
        "co_supervisor_email": _find(headers, "co-supervisor e-mail", "cosupervisor email", "co-supervisor email"),
        "min": _find(headers, "minimum", "min"),
        "max": _find(headers, "maximum", "max"),
        "location": _find(headers, "lab/ non-lab", "lab/non lab", "lab or non", "location"),
        "equipment": _find(headers, "equipment"),
        "fume": _find(headers, "fume"),
        "remarks": _find(headers, "remarks", "remark"),
        "external": _find(headers, "external"),
        "status": _find(headers, "status"),
    }
    # the co-supervisor column may be the one that also says "(OR STUDENT LED)"
    if col["slp"] is not None and col["co_supervisor"] == col["slp"]:
        col["slp"] = None
    lab_cols = {}
    for lab in LAB_COLUMNS:
        i = _find(headers, lab.lower(), exact=True)
        if i is not None:
            lab_cols[lab] = i

    projects: list[Project] = []
    seen = set()
    for r in rows[hi + 1:]:
        title = _cell(r, col["title"])
        code = _code_from(_cell(r, col["code"])) if col["code"] is not None else None
        if code is None:
            code = _code_from(title)          # "12. Title" style (2022 template)
            if code and title.startswith(code):
                title = re.sub(r"^\s*\d{3}\.?\s*", "", title)
        if not title or not code:
            continue
        level_raw = _cell(r, col["level"]).lower()
        slp = _cell(r, col["slp"])
        co = _cell(r, col["co_supervisor"])
        if "slp" in level_raw or "student" in level_raw:
            level = {"1": "1000", "2": "2000", "3": "3000"}.get(code[0], "3000")
            slp = slp or co
        else:
            m = re.search(r"[123]000", level_raw)
            level = m.group() if m else {"1": "1000", "2": "2000", "3": "3000"}.get(code[0], "")
        if level_raw.startswith("student") or "slp" in level_raw:
            co = ""
        if code in seen:
            raise ValueError(f"{path}: project code {code} appears twice")
        seen.add(code)
        status_raw = _cell(r, col["status"]).lower()
        projects.append(Project(
            code=code, title=title, level=level,
            min_students=_int(_cell(r, col["min"]), 1),
            max_students=_int(_cell(r, col["max"]), 0),
            supervisor=_cell(r, col["supervisor"]),
            supervisor_email=_cell(r, col["supervisor_email"]).lower(),
            co_supervisor=co,
            co_supervisor_email=_cell(r, col["co_supervisor_email"]).lower(),
            slp_leaders=slp,
            external=_bool(_cell(r, col["external"])),
            location=_cell(r, col["location"]),
            labs={lab: _cell(r, i) for lab, i in lab_cols.items() if _cell(r, i)},
            equipment=_cell(r, col["equipment"]),
            fume_hoods=_cell(r, col["fume"]),
            remarks=_cell(r, col["remarks"]),
            status="closed" if status_raw in ("closed", "cancelled", "canceled", "withdrawn") else "open",
        ))
    if not projects:
        raise ValueError(f"{path}: no project rows found")
    return projects


# ---------------------------------------------------------------------------
# preferences (Qualtrics export or the tool's own clean CSV)
# ---------------------------------------------------------------------------
def read_preferences(path, projects: list[Project]) -> list[Preference]:
    rows = _rows(Path(path))
    if not rows:
        return []
    by_title = {norm_title(p.title): p.code for p in projects}
    codes = {p.code for p in projects}

    def to_code(value: str) -> str | None:
        c = _code_from(value)
        if c and c in codes:
            return c
        t = norm_title(re.sub(r"\(\d{3}\)\s*$", "", str(value)))
        return by_title.get(t)

    headers = [_norm_header(c) for c in rows[0]]
    qualtrics = any("importid" in _norm_header(c) for r in rows[1:3] for c in r) or \
        any(h in ("startdate", "enddate", "start date", "end date") for h in headers[:2])
    start = 3 if qualtrics else 1
    if qualtrics and len(rows) > 1 and not any("importid" in _norm_header(c) for c in rows[2] if c):
        start = 2  # export without the ImportId row

    id_col = _find(headers, "student id", "student_id", "student number", "id number", required=True)
    name_col = _find(headers, "student name", "name")
    take_col = _find(headers, "will take", "i will take", "will_take", "taking a project")
    choice_cols = []
    for word in ("first", "second", "third", "fourth", "fifth"):
        i = _find(headers, f"{word} choice")
        if i is not None:
            choice_cols.append(i)
    if not choice_cols:
        for k in range(1, 6):
            i = _find(headers, f"choice{k}", f"choice {k}", f"choice_{k}")
            if i is not None:
                choice_cols.append(i)
    if not choice_cols:
        raise ValueError(f"{path}: no choice columns found")
    date_col = _find(headers, "enddate", "end date", "recordeddate", "submitted")

    prefs: dict[str, Preference] = {}
    for r in rows[start:]:
        sid = re.sub(r"\D", "", _cell(r, id_col))
        if not sid:
            continue
        take_raw = _cell(r, take_col).lower() if take_col is not None else "yes"
        will_take = take_raw in ("", "1", "yes", "y", "true", "ja")
        choices = []
        for i in choice_cols:
            c = to_code(_cell(r, i))
            if c and c not in choices:
                choices.append(c)
        pr = Preference(sid, choices, will_take, _cell(r, date_col), _cell(r, name_col))
        prefs[sid] = pr            # a later row overwrites an earlier one (students resubmit)
    return list(prefs.values())


# ---------------------------------------------------------------------------
# students (the target group)
# ---------------------------------------------------------------------------
def read_students(path) -> list[Student]:
    rows = _rows(Path(path))
    headers = [_norm_header(c) for c in rows[0]]
    col = {
        "id": _find(headers, "student id", "student_id", "student", "id", required=True),
        "name": _find(headers, "student name", "name"),
        "email": _find(headers, "email", "e-mail"),
        "batch": _find(headers, "batch", "level"),
        "c2000": _find(headers, "completed_2000", "completed 2000", "2000 done"),
        "c3000": _find(headers, "completed_3000", "completed 3000", "3000 done"),
        "needs": _find(headers, "needs_3000", "needs 3000", "must 3000"),
        "done": _find(headers, "done_titles", "done titles", "previous projects"),
        "notes": _find(headers, "notes", "note"),
    }
    out, seen = [], set()
    for r in rows[1:]:
        sid = re.sub(r"\D", "", _cell(r, col["id"]))
        if not sid:
            continue
        if sid in seen:
            raise ValueError(f"{path}: student {sid} appears twice")
        seen.add(sid)
        batch_raw = _cell(r, col["batch"]).lower()
        batch = "1000" if batch_raw.startswith("1000") or batch_raw in ("1", "intro", "introductory") else "upper"
        done = [t.strip() for t in re.split(r"[|;]", _cell(r, col["done"])) if t.strip()]
        out.append(Student(
            id=sid, name=_cell(r, col["name"]), email=_cell(r, col["email"]).lower(), batch=batch,
            completed_2000=_int(_cell(r, col["c2000"])), completed_3000=_int(_cell(r, col["c3000"])),
            needs_3000=_bool(_cell(r, col["needs"])), done_titles=done, notes=_cell(r, col["notes"]),
        ))
    return out


def students_from_preferences(prefs: list[Preference], batch: str) -> list[Student]:
    """When ESD has not supplied a target-group file: everyone who filled in the form."""
    return [Student(id=p.student_id, name=p.name, batch=batch) for p in prefs]


# ---------------------------------------------------------------------------
# overrides (the committee's manual passes), one action per row
# ---------------------------------------------------------------------------
def read_overrides(path) -> Overrides:
    """CSV with columns action, student_id, code, value.

    action: pin | forbid | close | max | min | external
    """
    ov = Overrides()
    if not path:
        return ov
    rows = _rows(Path(path))
    headers = [_norm_header(c) for c in rows[0]]
    a = _find(headers, "action", required=True)
    s = _find(headers, "student")
    c = _find(headers, "code", "project")
    v = _find(headers, "value")
    for r in rows[1:]:
        action = _cell(r, a).lower()
        sid = re.sub(r"\D", "", _cell(r, s)) if s is not None else ""
        code = _code_from(_cell(r, c)) or _cell(r, c)
        val = _cell(r, v)
        if action == "pin":
            ov.pins[sid] = code
        elif action == "forbid":
            ov.forbids.add((sid, code))
        elif action == "close":
            ov.closed.add(code)
        elif action == "max":
            ov.max_override[code] = _int(val)
        elif action == "min":
            ov.min_override[code] = _int(val)
        elif action == "external":
            ov.external.add(code)
        elif action:
            raise ValueError(f"{path}: unknown action '{action}'")
    return ov


def write_clean_projects_csv(projects: list[Project], path) -> None:
    """The tool's own flat format (what the web catalogue exports)."""
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["level", "code", "title", "supervisor", "supervisor_email", "co_supervisor",
                    "co_supervisor_email", "slp", "external", "min", "max", "location",
                    *LAB_COLUMNS, "equipment", "fume_hoods", "remarks", "status"])
        for p in projects:
            w.writerow([p.level, p.code, p.title, p.supervisor, p.supervisor_email, p.co_supervisor,
                        p.co_supervisor_email, p.slp_leaders, "yes" if p.external else "",
                        p.min_students, p.max_students, p.location,
                        *[p.labs.get(l, "") for l in LAB_COLUMNS], p.equipment, p.fume_hoods,
                        p.remarks, p.status])


def dump_json(obj, path) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False, default=str)
