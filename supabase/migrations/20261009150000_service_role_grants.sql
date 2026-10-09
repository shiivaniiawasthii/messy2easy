-- The project was created with "Automatically expose new tables" turned off,
-- so the server-side service role (used only by Edge Functions, never in the
-- browser) has no privileges on our tables. Give it full access, now and for
-- future tables. Logged-in app users are unaffected: they still go through RLS.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
