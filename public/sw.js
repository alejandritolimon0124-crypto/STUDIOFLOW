self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

// Keep authenticated pages and API responses on the network, never in a cache.
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request))
  }
})

self.addEventListener('push', (event) => {
  let payload

  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { body: event.data?.text() || 'Tienes un nuevo aviso en Studio Flow.' }
  }

  const title = payload.title || 'Studio Flow'
  const options = {
    body: payload.body || 'Tienes un nuevo aviso.',
    icon: payload.icon || '/pwa-192.png',
    badge: payload.badge || '/pwa-192.png',
    tag: payload.tag || 'studio-flow-notification',
    renotify: Boolean(payload.renotify),
    data: {
      targetUrl: payload.targetUrl || '/',
      notificationId: payload.notificationId || null,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.targetUrl || '/', self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const sameOriginClient = clients.find((client) => new URL(client.url).origin === self.location.origin)

      if (sameOriginClient) {
        await sameOriginClient.navigate(targetUrl)
        return sameOriginClient.focus()
      }

      return self.clients.openWindow(targetUrl)
    }),
  )
})
