-- ============================================================================
-- MSP Project Periods - database schema (Supabase / PostgreSQL)
-- ============================================================================
-- Run this once in the Supabase SQL editor. Then add the committee:
--   insert into admin_user (email) values ('name@maastrichtuniversity.nl');
--
-- What is here and what is deliberately not:
--   * period   one project period (2026-27 P6), its dates and two switches:
--              accepting submissions, catalogue published.
--   * project  one offered project, every field of the old Word template.
--              Supervisors submit through submit_project(); the committee
--              reviews, assigns codes, approves, returns or closes.
--   * NO student tables. Student preferences and allocations run locally in
--     the allocator (see allocator/README) until MSP management has decided
--     where student data may live. Adding them later is one more table.
--
-- Privacy: the public can read approved projects of a published period
-- (staff names and UM emails, the same as the printed booklet). Everything
-- else needs an allow-listed committee login.
-- ============================================================================

create table if not exists period (
  id                   uuid primary key default gen_random_uuid(),
  label                text not null unique,        -- '2026-27 P6'
  academic_year        text,                        -- '2026-27'
  sap_year             text,                        -- '2026'
  session              text,                        -- '300' = P3, '600' = P6
  submissions_open     boolean not null default false,
  catalogue_published  boolean not null default false,
  description_deadline date,
  signup_opens         date,
  signup_closes        date,
  period_start         date,
  period_end           date,
  symposium            date,
  notes                text,
  created_at           timestamptz not null default now()
);

create table if not exists project (
  id                   uuid primary key default gen_random_uuid(),
  period_id            uuid not null references period(id) on delete cascade,
  code                 text,                        -- '203', assigned by the committee
  level                text not null check (level in ('1000','2000','3000')),
  title                text not null,
  description          text,
  "references"         text,
  supervisor           text not null,
  supervisor_email     text not null,
  co_supervisor        text,
  co_supervisor_email  text,
  slp_leaders          text,                        -- student-led: names of the leaders
  external             boolean not null default false,
  organisation         text,
  min_students         int not null check (min_students >= 1),
  max_students         int not null check (max_students >= min_students),
  location             text,
  labs                 text[] not null default '{}',
  instruments          text[] not null default '{}',
  facilities           jsonb  not null default '{}'::jsonb,
  safety               text,
  budget_note          text,
  contact_note         text,
  status               text not null default 'submitted'
                       check (status in ('submitted','approved','returned','closed')),
  committee_note       text,
  submitted_by         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (period_id, code)
);
create index if not exists project_period_idx on project(period_id);

create table if not exists admin_user (
  email      text primary key,
  added_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Public write path: one function, no table INSERT policy.
-- ---------------------------------------------------------------------------
create or replace function submit_project(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  per  period%rowtype;
  new_id uuid;
begin
  select * into per from period where id = (p->>'period_id')::uuid;
  if not found then raise exception 'PERIOD_NOT_FOUND'; end if;
  if not per.submissions_open then raise exception 'SUBMISSIONS_CLOSED'; end if;
  if coalesce(btrim(p->>'title'), '') = '' then raise exception 'TITLE_REQUIRED'; end if;
  if coalesce(btrim(p->>'supervisor_email'), '') = '' then raise exception 'SUPERVISOR_REQUIRED'; end if;

  insert into project (period_id, level, title, description, "references", supervisor, supervisor_email,
                       co_supervisor, co_supervisor_email, slp_leaders, external, organisation,
                       min_students, max_students, location, labs, instruments, facilities,
                       safety, budget_note, contact_note, submitted_by)
  values (per.id, p->>'level', btrim(p->>'title'), p->>'description', p->>'references',
          btrim(p->>'supervisor'), lower(btrim(p->>'supervisor_email')),
          nullif(btrim(p->>'co_supervisor'), ''), nullif(lower(btrim(p->>'co_supervisor_email')), ''),
          nullif(btrim(p->>'slp_leaders'), ''), coalesce((p->>'external')::boolean, false),
          nullif(btrim(p->>'organisation'), ''),
          (p->>'min_students')::int, (p->>'max_students')::int, p->>'location',
          coalesce(array(select jsonb_array_elements_text(p->'labs')), '{}'),
          coalesce(array(select jsonb_array_elements_text(p->'instruments')), '{}'),
          coalesce(p->'facilities', '{}'::jsonb),
          nullif(btrim(p->>'safety'), ''), nullif(btrim(p->>'budget_note'), ''), nullif(btrim(p->>'contact_note'), ''),
          lower(btrim(p->>'supervisor_email')))
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table period     enable row level security;
alter table project    enable row level security;
alter table admin_user enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_user
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Periods: anyone may read (labels and dates only); committee writes.
drop policy if exists period_read  on period;
drop policy if exists period_admin on period;
create policy period_read  on period for select using (true);
create policy period_admin on period for all using (is_admin()) with check (is_admin());

-- Projects: the public sees approved projects of a published period, the
-- committee sees and edits everything. No public insert: submit_project() only.
drop policy if exists project_public_read on project;
drop policy if exists project_admin       on project;
create policy project_public_read on project for select
  using (status = 'approved' and exists (select 1 from period where period.id = project.period_id and period.catalogue_published));
create policy project_admin on project for all using (is_admin()) with check (is_admin());

-- The allow-list itself: readable and editable by admins only.
drop policy if exists admin_read  on admin_user;
drop policy if exists admin_write on admin_user;
create policy admin_read  on admin_user for select using (is_admin());
create policy admin_write on admin_user for insert with check (is_admin());

grant execute on function submit_project(jsonb) to anon, authenticated;
grant execute on function is_admin() to anon, authenticated;
