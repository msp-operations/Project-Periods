"""Data model for the MSP project allocation.

Everything the Project Committee and ESD work with today lives in three files:
the "bible" workbook (one row per project), the Qualtrics preference export
(one row per student with a top five) and the target-group list (which
students may take a project this period, and at which level). These classes
are those three files, nothing more.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

LEVELS = ("1000", "2000", "3000")

# Which labs the bible tracks, in the column order ESD uses. Values are "X",
# a count, or free text; the allocator never interprets them, it only carries
# them through to the lab overview for the DUB30 coordinators.
LAB_COLUMNS = (
    "PBL room", "DRY labs", "BIO", "ML1", "BIOCHEM", "Chem", "PHYsics",
    "PHY dark room", "BTR BIO", "Other location",
)


def norm_title(text: str) -> str:
    """Lower-case, collapse whitespace, strip punctuation that varies between copies."""
    import re
    t = (text or "").lower()
    t = re.sub(r"[–—\-:;,.()\[\]'\"‘’“”]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


@dataclass
class Project:
    code: str                     # three-digit project number, e.g. "203"
    title: str
    level: str                    # "1000" | "2000" | "3000"
    min_students: int
    max_students: int
    supervisor: str = ""
    supervisor_email: str = ""
    co_supervisor: str = ""
    co_supervisor_email: str = ""
    slp_leaders: str = ""         # names of the student leaders, empty if staff-led
    external: bool = False        # supervised outside MSP (company, MUMC, other faculty)
    location: str = ""            # "DUB30", "PHS", "partial", free text
    labs: dict = field(default_factory=dict)
    equipment: str = ""
    fume_hoods: str = ""
    remarks: str = ""
    status: str = "open"          # "open" | "closed" (withdrawn or cancelled by the committee)
    extra: dict = field(default_factory=dict)

    @property
    def is_slp(self) -> bool:
        return bool((self.slp_leaders or "").strip())

    @property
    def label(self) -> str:
        return f"{self.code}. {self.title}"

    @property
    def supervisor_emails(self) -> list[str]:
        return [e.strip() for e in (self.supervisor_email, self.co_supervisor_email) if e and e.strip()]

    @property
    def lab_based(self) -> bool:
        loc = (self.location or "").lower()
        if "dub" in loc or "lab" in loc and "non" not in loc:
            return True
        return any(str(v).strip() for k, v in self.labs.items()
                   if k not in ("PBL room", "DRY labs", "Other location"))


@dataclass
class Student:
    id: str                       # UM student number without the "i", e.g. "6355211"
    name: str = ""
    email: str = ""
    batch: str = "upper"          # "1000" = must take a 1000-level project (second semester)
                                  # "upper" = chooses among 2000/3000-level projects
    completed_2000: int = 0       # how many 2000-level projects already passed (for the SAP code)
    completed_3000: int = 0
    needs_3000: bool = False      # final year and still missing the compulsory 3000-level
    done_titles: list = field(default_factory=list)   # titles of projects already done (no repeats)
    notes: str = ""

    def eligible_levels(self) -> set[str]:
        if self.batch == "1000":
            return {"1000"}
        if self.needs_3000:
            return {"3000"}
        return {"2000", "3000"}

    @property
    def login_id(self) -> str:
        return f"I{self.id}"


@dataclass
class Preference:
    student_id: str
    choices: list                 # ordered project codes, first = favourite
    will_take: bool = True
    submitted_at: str = ""
    name: str = ""                # as typed on the form, kept for cross-checking


@dataclass
class Overrides:
    """The manual passes the committee makes after the first run."""
    pins: dict = field(default_factory=dict)          # student_id -> code (SLP leaders, special cases)
    forbids: set = field(default_factory=set)         # (student_id, code)
    closed: set = field(default_factory=set)          # codes the committee cancels
    max_override: dict = field(default_factory=dict)  # code -> int (supervisor agreed to take more)
    min_override: dict = field(default_factory=dict)  # code -> int
    external: set = field(default_factory=set)        # codes flagged external by hand


@dataclass
class Assignment:
    student_id: str
    code: Optional[str]           # None = could not be placed
    rank: Optional[int]           # 1..5 for a listed choice, 0 = pinned, None = unlisted
    reason: str = ""


@dataclass
class Result:
    assignments: list
    counts: dict                  # code -> number of students placed
    closed: list                  # codes that end up not running
    objective: float
    status: str
    seconds: float
    warnings: list = field(default_factory=list)

    def by_student(self) -> dict:
        return {a.student_id: a for a in self.assignments}

    def by_project(self) -> dict:
        out: dict = {}
        for a in self.assignments:
            if a.code is not None:
                out.setdefault(a.code, []).append(a.student_id)
        return out

    @property
    def unassigned(self) -> list:
        return [a.student_id for a in self.assignments if a.code is None]
