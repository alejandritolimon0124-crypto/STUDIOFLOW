# Suspended studio redemptions

Both client_apply_appointment_reward and client_redeem_flow_points lacked a studio eligibility check. They now require an approved, nonarchived studio when the operation targets a studio, before economic mutations. The row is locked for share to serialize against suspension. Independent operations are unchanged.

Isolated rollback verification:
- verify_suspended_studio_redemptions.sql: both paths reject a suspended studio, ledger unchanged.
- verify_multiple_breaks.sql: artist and membership booking, failed reward rollback, confirmation, cancellation and rebooking pass.

Existing records were reused; no mock users or persistent test bookings were created. No balances or collection history were deleted. Lookadoc was not modified.

Remaining coverage: a successful complete redemption in an approved studio has not been exercised in this batch. Marketplace booking already checks suspended studios, but its approval-state coverage and concurrent suspension behavior require further review. This is not a declaration that the whole audit is complete.
