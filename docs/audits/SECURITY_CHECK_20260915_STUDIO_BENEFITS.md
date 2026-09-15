# Studio award scope

An active artist previously bypassed the studio approval check when awarding appointment points. The award RPC now requires an approved, nonarchived studio for every appointment carrying a studio ID, after actor authorization. A shared row lock serializes the check against studio suspension.

Independent appointments without a studio ID do not enter this new check. Existing balances and historical records are not modified.

Isolated rollback tests passed:

- verify_active_artist_suspended_studio.sql: existing active artist rejected for suspended studio, ledger unchanged.
- verify_appointment_rewards.sql: valid award, snapshot, duplicate prevention and cancellation checks.
- verify_suspended_client_benefits.sql: inactive client and suspended profile rejected.

No new test users were created. Lookadoc was not touched. These tests cover the award path, not all operations of suspended studios or the entire security audit.
