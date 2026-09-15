# Owner booking suspension

The dedicated studio owner booking RPC only checked ownership, not studio approval. Added approved/nonarchived studio check with a shared row lock immediately after ownership authorization. The general owner access helper remains unchanged so historical access is not blanket-blocked.

Isolated rollback tests passed:
- Suspended studio owner booking rejected before slot lookup.
- Owner access helper still accepts its own suspended studio.
- Existing artist and membership booking regression tests passed.
- verify_account_isolation.sql passed client isolation, studio owner scoped reads/profile updates, platform owner billing access and inactive profile rejection.

No production data or Lookadoc changes. The tests do not establish that every billing screen works for a suspended studio owner.

Remaining: owner booking client eligibility (this dedicated path still uses nonarchived rather than active lookup), valid owner booking with real slots, complete suspended-owner accounting reads, reactivation debt enforcement and other owner mutations. Audit remains open.
