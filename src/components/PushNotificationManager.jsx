import { useCallback, useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { useApp } from '../contexts/appContextCore'
import {
  registerCurrentDeviceForPush,
  requestAndRegisterPushNotifications,
  supportsPushNotifications,
} from '../services/pushNotificationService'

function roleMessage(role) {
  if (role === 'client') return 'Recibe confirmaciones, cumpleaños, mantenimiento y beneficios aunque Studio Flow esté cerrado.'
  if (role === 'studio_owner') return 'Recibe las nuevas reservas de tu estudio aunque Studio Flow esté cerrado.'
  return 'Recibe tus nuevas reservas aunque Studio Flow esté cerrado.'
}

function PushNotificationManager() {
  const { session } = useApp()
  const [permission, setPermission] = useState(() => (
    supportsPushNotifications() ? Notification.permission : 'unsupported'
  ))
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const profileId = session.profile?.id || session.user?.profileId || session.user?.id || null
  const eligible = Boolean(profileId && !session.isMockSession && supportsPushNotifications())

  const syncGrantedSubscription = useCallback(async () => {
    if (!eligible || Notification.permission !== 'granted') return

    try {
      await registerCurrentDeviceForPush()
      setPermission('granted')
      setMessage('')
    } catch {
      setMessage('No pudimos conectar este dispositivo. Lo intentaremos nuevamente.')
    }
  }, [eligible])

  useEffect(() => {
    if (!eligible) return undefined

    const refreshPermission = () => {
      setPermission(Notification.permission)
      if (Notification.permission === 'granted') syncGrantedSubscription()
    }

    refreshPermission()
    window.addEventListener('focus', refreshPermission)
    document.addEventListener('visibilitychange', refreshPermission)
    window.addEventListener('studioflow:notification-permission', refreshPermission)

    return () => {
      window.removeEventListener('focus', refreshPermission)
      document.removeEventListener('visibilitychange', refreshPermission)
      window.removeEventListener('studioflow:notification-permission', refreshPermission)
    }
  }, [eligible, profileId, syncGrantedSubscription])

  const enable = async () => {
    setBusy(true)
    setMessage('')
    try {
      await requestAndRegisterPushNotifications()
      setPermission('granted')
    } catch (error) {
      setPermission(Notification.permission)
      setMessage(error.message || 'No se pudieron activar las notificaciones.')
    } finally {
      setBusy(false)
    }
  }

  if (!eligible || permission === 'granted' || dismissed) return null

  return (
    <aside className="push-permission-prompt" aria-live="polite">
      <button className="push-permission-close" type="button" aria-label="Cerrar" onClick={() => setDismissed(true)}>
        <X size={18} aria-hidden="true" />
      </button>
      <span className="push-permission-icon" aria-hidden="true"><BellRing size={24} /></span>
      <div>
        <strong>Activa tus avisos</strong>
        <p>{permission === 'denied' ? 'Permite las notificaciones desde la configuración del navegador para recibir avisos.' : roleMessage(session.role)}</p>
        {message && <small role="status">{message}</small>}
      </div>
      {permission !== 'denied' && (
        <button className="button button-primary button-sm" type="button" disabled={busy} onClick={enable}>
          {busy ? 'Activando...' : 'Activar'}
        </button>
      )}
    </aside>
  )
}

export default PushNotificationManager
