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

## Account suspension

Administrators use `set_app_user_suspended` to suspend or reactivate an account.
The operation checks the opaque session and current server-side role. Direct API
updates to `is_suspended` are not granted. Suspension revokes existing tokens;
login, session creation, RPC resolution and RLS all reject suspended accounts.
Reactivation requires a fresh login. Manual suspension protects the last active administrator. Automatic suspension after eight failures applies to every account, including the last administrator.
The browser rechecks account access every 30 seconds and on focus/reconnection.
An offline device cannot learn a remote suspension until it reconnects.
Run `tests/account_suspension.sql` for rolled-back integration verification.

## Failed passwords and offline suspension

Eight consecutive invalid passwords suspend an account. Successful authentication
resets the count before that threshold. PostgreSQL serializes credential checks;
authentication denial is returned as data so the increment and suspension commit.
`login_app_user` and `authenticate_app_user` return an `error` field on denial;
the legacy `create_task_session` returns NULL. Direct password-change attempts
also count. Network failures and missing local verifiers do not count.

Offline failures persist per account in local storage. Once locked out, even the
correct password cannot unlock offline. The pending report survives logout and
reload and is sent before any Supabase REST request, including queued sync and
login, with retry on reconnection. A server-held hash of a previously issued
session permits only suspension of its own account, even after session expiry.
Reports are idempotent. Reactivation increments an epoch, so reports from older
sessions cannot suspend the account again. Only successful online authentication
clears the local suspension after reporting. Offline storage remains under the
browser owner's control; it is not a tamper-proof security boundary.

If the last administrator is suspended automatically, a database administrator
must set that account's `is_suspended` to `false` in Supabase. The trigger resets
the attempt counter and invalidates old report capabilities. The account then
requires an online login with the correct password.

Run `tests/password_attempt_suspension.sql` and `tests/last_admin_lockout.sql` with
ON_ERROR_STOP. Both roll back their changes; the latter temporarily demotes other
administrators inside its transaction to exercise the last-admin case.
