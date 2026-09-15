# Studio reactivation and billing

Approval now checks outstanding completed-appointment commissions net of recorded monthly payments, using the same period and amount conventions as current payment accounting. The owner reactivation wrapper delegates to this guarded approval path. Current-month unpaid amounts are included, not just overdue amounts.

Testing exposed approved-only studio filters in billing summary and history. Both now include suspended, nonarchived studios.

verify_studio_approval_debt.sql passed in isolated rollback transaction: existing past appointment temporarily completed, existing studio payments temporarily zeroed; actual suspension performed; studio remained in billing summary/history; direct approval and reactivation both rejected debt; payment RPC allowed subsequent reactivation; appointment count unchanged. No production payment or appointment mutation, no Lookadoc changes.

Scope: platform-owner RPCs, not visual browser verification of every accounting screen or concurrent settlement and booking. Other archived/rejected studio lifecycle cases remain outside this change.
