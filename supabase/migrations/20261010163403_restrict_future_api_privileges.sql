-- Per-schema REVOKE cannot remove PostgreSQL's global PUBLIC EXECUTE default.
-- Apply the owner-wide revoke, keeping existing functions and explicit grants.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
