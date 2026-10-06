/* ==========================================================================
   CONFIGURE ME  -  the only file you normally need to edit.
   --------------------------------------------------------------------------
   1. Create a project at https://supabase.com in an EU region (Frankfurt),
      the same organisation ("MSP") that hosts the tutoring tool.
   2. Run app/supabase/schema.sql once in the SQL editor, then add the
      committee's email addresses to admin_user (instructions in the file).
   3. Supabase dashboard > Project Settings > API: copy the Project URL and
      the "anon public" key below.
   4. The anon key is safe to publish. Row-Level Security decides what it can
      do: read the published catalogue, submit a project through the
      submit_project() function, nothing else.

   Leave the placeholders to run the site in PREVIEW mode: the catalogue shows
   sample projects and the submission form explains what it would send.
   ========================================================================== */
window.MSP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_ANON_KEY",

  // Text shown on the pages. Safe to change any time.
  CONTACT_EMAIL: "msp-projects@maastrichtuniversity.nl",
  COMMITTEE_NAME: "MSP Project Committee",
};
