# Successful studio appointment reward

Executed verify_successful_studio_reward.sql on studioflow_audit_verified_20260913.

An existing scheduled studio appointment, active client/artist and active artist-owned discount reward were reused. The appointment reward snapshot was temporarily set to the existing reward cost; points were awarded through the application RPC, then redeemed through the client RPC. All changes were rolled back.

Passed assertions:
- Approved studio appointment accepts eligible reward.
- Discounted total matches saved original price and reward percentage.
- Quoted commission is 10 percent of the discounted total.
- Client balance decreases by exactly the reward cost.
- Repeating the redemption is rejected without additional points spent.
- Exactly one applied redemption exists during the transaction.

No production changes or Lookadoc changes. No new mock users were created. This batch needed no application correction.

Scope limitations: this tests an artist-owned reward applied to a studio appointment, not a studio-owned reward (none exists in the restored snapshot). It tests quoted commission, not monthly billing settlement. Full browser concurrency and manual booking authorization remain separate checks.
