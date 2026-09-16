# Studio Flow: release review, 2026-09-15

## Scope

Local working tree only. No deployment, no production database changes, no
customer records created or changed. Lookadoc excluded.

## Verified in this pass

- Production build succeeds without chunk-size warnings.
- Read-only database checks use `studioflow_audit_verified_20260913` in
  `supabase_db_STUDIO_FLOW`, not the hosted database.
- Anonymous direct SELECT on profiles is rejected by table permissions.
- Anonymous administrative dashboard RPC is rejected with Auth session required.

## Findings requiring follow-up

### Dependency remediation in the local working tree

Compatible updates and a scoped brace-expansion 5.x override have been applied.
A clean npm ci installed the lockfile contents; verified actual installed Vite
8.3.0 and React Router 7.18.4. Full npm audit now reports zero known
vulnerabilities. Build and lint pass. Installation still reports deprecation
notices for legacy transitive packages; these are not a clean bill of security.
Authenticated browser regression checks and deployment remain pending.
The dependency findings below describe the pre-remediation baseline.

- npm audit reports 10 affected package entries: 7 high, 1 moderate, 2 low.
  These are package advisory classifications, not proof of exploitability here.
- Production-only audit reports react-router (high) and react-router-dom (low).
  Installed routing version is 7.15.0. Evaluate compatible patched versions,
  update the lockfile, then repeat routing, build and dependency checks.
- Development-tool advisories include Vite and transitive build dependencies.
  Do not expose the development server publicly while these remain unreviewed.
- Local catalog has 40 public tables without RLS and 126 security-definer
  functions executable by anon. This alone does not prove data exposure:
  profiles SELECT is revoked and the tested dashboard RPC checks authentication.
  Review grants and internal authorization per function; do not blanket-revoke
  public registration/catalog functions without evaluating their callers.
- This local copy has no supabase_migrations tracking tables. Its correspondence
  to hosted production has not been established, even though recent export and
  appointment-completion functions exist.

## Not yet verified

- Authenticated browser flows for client, artist, studio owner and platform owner.
- Cross-account authorization across all RPCs and storage objects.
- Full booking/confirmation/completion/cancellation flow after local refactors.
- Accounting and reward regression checks using authorized isolated transactions.
- Installed-device Excel downloads, installation and update behavior.
- Recovery email delivery, production backup/restore and hosted schema parity.

Passing lint/build is not a complete security or release approval.
