# Artist approval debt bypass

Artist activation checked unpaid commissions but approval set the same active status without that check. Approval now uses the same existing unpaid commission helper after authorization and artist row locking.

verify_artist_approval_debt.sql passed in isolated rollback transaction: an existing past appointment temporarily completed and existing payment amounts zeroed to exercise actual debt; activation and approval rejected; the payment RPC cleared debt and approval succeeded. No production payments or appointments changed.

The helper includes completed independent appointments through the current month, net of monthly recorded payments. This change does not redefine debt as overdue-only. Studio reactivation debt enforcement and suspended accounting screen checks remain pending. Lookadoc untouched.
