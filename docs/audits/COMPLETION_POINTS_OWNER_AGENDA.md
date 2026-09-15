# Completion required for points and owner agenda

Points now require completed appointment status and completed_at in the award RPC, after existing actor/client/studio authorization. UI award controls require completed status. Artist appointment data refreshes on the completion event; studio refresh already exists.

Owner-only paginated agenda RPC exposes artist or studio appointments without status/date exclusions. The UI reuses authorized appointment payment details for original cost, discount, points and total. Twenty events per page, latest first. This is read-only; it does not complete or cancel events.

Isolated test verify_completed_points_owner_agenda.sql passed: scheduled award rejected, completion then award succeeds once, commission row exists, artist denied owner agenda, owner receives events/payment details. Build and targeted lint passed. No real appointments changed. Mobile visual verification remains pending.

Previous reward tests assuming points can be awarded while scheduled need updating to the new business rule; do not treat the previous 17-test run as a current full regression pass. Original amount display reuses existing payment reconstruction; fully discounted records can have an unknown original amount.

This prevents points from bypassing completion, but does not force a provider who awards no points to mark a performed service complete. Owner agenda provides oversight, not proof of attendance.
