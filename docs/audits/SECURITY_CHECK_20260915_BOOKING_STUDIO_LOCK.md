# Studio booking eligibility

Marketplace booking previously checked suspension without locking the studio row and did not require approved status. It now requires an approved, nonarchived studio and uses FOR SHARE to serialize against status updates. Independent booking is unchanged.

Verification in the isolated restored audit database:
- verify_multiple_breaks.sql now tests rejection of a suspended studio with valid contiguous slots, without creating an appointment or occupying slots.
- Approved studio membership and independent artist booking, confirmation, cancellation and rebooking passed. Failed reward booking rollback passed.
- Two database sessions: one held the same FOR SHARE studio eligibility lock; another attempted suspension with a one-second lock timeout and was blocked. Both transactions rolled back. This tests the row-lock primitive, not full concurrent booking and administrative RPC calls.

No production appointments, balances or historical records were modified. Lookadoc was not touched.

Pending: a complete successful studio redemption and full concurrent end-to-end suspension/booking test. Manual booking paths and lock-order interactions across administrator actions need separate review; this is not a complete security sign-off.
