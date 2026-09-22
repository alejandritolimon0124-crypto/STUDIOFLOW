import { requireSupabase } from '../lib/supabaseClient'

const VAPID_PUBLIC_KEY = 'BH4Zy2ocoFe93yjZ7fNeWvrlIGGT3l0N9MfP9b7dWSB4Oy_bGYIux_5IjltQL3qm2mXJ0obOWX9COGhPsFu7djg'
export const pushRegistrationStorageKey = 'studio-flow-background-push-active'

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)

  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)))
}

export function supportsPushNotifications() {
  return Boolean(
    typeof window !== 'undefined'
    && window.isSecureContext
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window,
  )
}

export async function registerCurrentDeviceForPush() {
  if (!supportsPushNotifications()) {
    throw new Error('Este navegador no admite notificaciones en segundo plano.')
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Se necesita permiso para activar las notificaciones.')
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const { error } = await requireSupabase().rpc('studio_flow_save_push_subscription', {
    p_subscription: subscription.toJSON(),
    p_device_label: navigator.platform || 'Dispositivo',
    p_user_agent: navigator.userAgent,
  })

  if (error) throw error
  localStorage.setItem(pushRegistrationStorageKey, 'true')
  return subscription
}

export async function requestAndRegisterPushNotifications() {
  if (!supportsPushNotifications()) {
    throw new Error('Instala Studio Flow o utiliza un navegador compatible para recibir avisos con la app cerrada.')
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()

  if (permission !== 'granted') {
    throw new Error('El permiso de notificaciones no fue concedido.')
  }

  return registerCurrentDeviceForPush()
}

export async function detachCurrentDevicePushSubscription() {
  if (!supportsPushNotifications()) return

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return

    await requireSupabase().rpc('studio_flow_remove_push_subscription', {
      p_endpoint: subscription.endpoint,
    })
    localStorage.removeItem(pushRegistrationStorageKey)
  } catch {
    // Closing a session must continue even if the device is temporarily offline.
  }
}
