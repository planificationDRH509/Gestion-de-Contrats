# Application access

The application authenticates with opaque, expiring sessions in `app_task_sessions`.
Supabase's `anon` and `authenticated` database roles are transport roles: neither
alone grants access to application data. REST requests carry the opaque token in
`x-app-session`; RLS resolves its hash against the server-side session table and
loads the current account role and permitted workspaces. Browser-stored role and
user ID values are not authorization inputs.

`login_app_user` verifies credentials inside PostgreSQL and returns only the safe
profile and session token. Passwords are SHA-256 prehashed, then salted with bcrypt
(cost 12); the old plaintext column is emptied. API roles cannot read either
password column, including through filters. Password changes revoke all sessions.

All public tables have RLS enabled. Tables accessed exclusively through RPCs retain
no direct API privileges and no RLS policies; the advisor's informational
`rls_enabled_no_policy` finding for these tables is intentional deny-by-default.
Privileged RPC implementations live in non-exposed schemas and retain their own
session, workspace and role checks. Public RPCs use SECURITY INVOKER.

Account creation and role changes require an administrator. The creator cannot
change their own role. Contract status changes require a controller or administrator;
contract deletion requires an administrator. Cross-workspace identity/dossier
references and writes outside permitted workspaces are rejected. TRUNCATE and DDL
privileges are not granted to API roles. Newly created public tables/functions must
receive explicit grants after their authorization rules are implemented.

## Deployment order

1. Apply `20261010162824_secure_application_access.sql` (compatible login RPC).
2. Deploy the client with `login_app_user` and `createSessionFetch`.
3. Apply `20261010163211_enforce_application_rls.sql` (hashing and enforcement).
4. Apply `20261010163403_restrict_future_api_privileges.sql` (future object privileges).
5. Run `tests/application_security.sql` with `ON_ERROR_STOP=1` and recheck advisors.

Existing valid session tokens continue working. Old installed PWA versions must
reload to pick up the new login and session transport. Accounts whose credentials
were previously stored in the publicly readable table should change their password;
this audit does not establish whether anyone actually retrieved those credentials.

Verification uses synthetic fixtures inside rolled-back transactions. Run the
application security, contract lists, offline contract lists, offline tasks and
pinned contracts SQL scripts. Unit coverage includes token destination isolation,
token rotation/logout, RPC login and failure without a plaintext-password fallback.

`tests/default_api_privileges.sql` also checks the effective permissions of newly
created tables, sequences and functions in a rolled-back transaction.
