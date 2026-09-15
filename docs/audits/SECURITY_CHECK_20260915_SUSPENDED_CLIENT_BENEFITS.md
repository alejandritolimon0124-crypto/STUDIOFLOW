# Suspended client benefits

## Rule

Suspended or inactive clients cannot receive new appointment points, including points for appointments created before suspension. Existing balances and history are preserved. Linked profiles must also be active. Active manual clients without a linked profile remain supported.

The award function checks client eligibility after actor authorization and locks the relevant client/profile rows during the grant. Existing booking, reward application and redemption guards remain in place.

## Verification

Executed in isolated database studioflow_audit_verified_20260913 with transactions rolled back:

- verify_suspended_client_benefits.sql: inactive client and suspended linked profile rejected; ledger unchanged.
- verify_appointment_rewards.sql: valid awards, snapshot amounts, idempotency and cancelled appointment rejection passed.
- verify_suspended_client_actions.sql: suspended client booking, reward application and redemption rejected.

No test users were created or production balances changed. Lookadoc was not modified.

## Scope

This verifies these benefit paths, not completion of the entire security audit. The suspended-studio test covers an inactive artist; an active artist associated with a suspended studio requires separate review.
