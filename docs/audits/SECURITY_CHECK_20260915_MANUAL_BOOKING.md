# Manual booking eligibility

The manual appointment core accepted inactive clients and did not check studio approval. It now requires an active, nonarchived client, an active linked profile when present, and an approved nonarchived studio for studio-context appointments. Eligibility rows are locked FOR SHARE. Existing independent manual clients without profiles remain supported.

verify_multiple_breaks.sql passed in isolated rollback transactions:
- Inactive client rejected for independent and membership manual booking.
- Suspended studio rejected for membership manual booking.
- Inactive membership rejected by existing authorization guard.
- Valid independent and membership manual appointments still created.
- Availability breaks, notice, marketplace booking, confirmation, cancellation and rebooking passed.

No production appointment or balance was modified. Lookadoc was not touched.

Scope: core RPC and existing artist/membership fixtures. Dedicated studio-owned services, other owner wrappers, concurrent lock ordering and a separate suspended-linked-profile fixture still require coverage. Not a complete security sign-off.
