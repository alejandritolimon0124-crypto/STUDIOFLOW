export function depositAmount(total, policy) {
  const price = Math.max(0, Number(total) || 0)
  const value = Math.max(0, Number(policy?.value) || 0)
  const amount = policy?.kind === 'fixed' ? value : price * value / 100
  return Math.min(price, Math.round(amount * 100) / 100)
}
