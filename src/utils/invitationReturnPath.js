export function getInvitationReturnPath(search) {
  const value = new URLSearchParams(search).get('next') || ''
  return /^\/invitacion\/[a-f0-9]{24}(\?ref=[a-f0-9]{24})?$/.test(value) ? value : ''
}

const storageKey = 'studio-flow-pending-invitation'

export function rememberInvitationReturnPath(path) {
  if (!getInvitationReturnPath(`?next=${encodeURIComponent(path)}`)) return
  try { sessionStorage.setItem(storageKey, path) } catch { /* Storage may be unavailable. */ }
}

export function getPendingInvitationReturnPath() {
  try { return getInvitationReturnPath(`?next=${encodeURIComponent(sessionStorage.getItem(storageKey) || '')}`) } catch { return '' }
}

export function clearPendingInvitationReturnPath() {
  try { sessionStorage.removeItem(storageKey) } catch { /* Storage may be unavailable. */ }
}
