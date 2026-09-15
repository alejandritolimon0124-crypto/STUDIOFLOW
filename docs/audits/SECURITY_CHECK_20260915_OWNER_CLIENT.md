# Owner client eligibility

Dedicated owner booking now rejects existing inactive/archived clients and suspended linked profiles. Explicit nonexistent client IDs fail instead of falling through to client creation. Email lookup includes inactive matches so they cannot fall through to replacement creation. Client and linked-profile rows are locked for share.

Isolated rollback tests in verify_multiple_breaks.sql passed inactive client rejection by ID and email, successful owner booking, and existing artist/membership booking regressions. No production balances or appointments were changed; Lookadoc untouched.

Not yet tested: separate archived/profile-suspended fixtures and concurrent email registration. Debt review: studio_flow_admin_review_studio has no explicit debt check on approval; other enforcement paths still need inspection before concluding whether reactivation can bypass outstanding debt. Suspended owner accounting screens remain pending.
