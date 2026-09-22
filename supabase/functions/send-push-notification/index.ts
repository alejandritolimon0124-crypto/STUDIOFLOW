import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:no-reply@studioflow.vip'

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let outboxId = ''

  try {
    const payload = await request.json()
    outboxId = payload?.record?.id || payload?.outboxId || payload?.outbox_id
    const deliveryToken = payload?.record?.delivery_token || payload?.deliveryToken || payload?.delivery_token
    if (!outboxId || !deliveryToken) return json({ error: 'Missing delivery credentials' }, 400)

    const { data: outbox, error: outboxError } = await admin
      .from('push_notification_outbox')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .eq('id', outboxId)
      .eq('delivery_token', deliveryToken)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle()

    if (outboxError) throw outboxError
    if (!outbox) return json({ ok: true, skipped: 'already_processed' })

    const { data: subscriptions, error: subscriptionError } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('profile_id', outbox.profile_id)
      .is('revoked_at', null)

    if (subscriptionError) throw subscriptionError

    if (!subscriptions?.length) {
      await admin.from('push_notification_outbox').update({
        status: 'no_subscription',
        last_error: 'No active device subscriptions',
      }).eq('id', outbox.id)
      return json({ ok: true, sent: 0 })
    }

    const notification = JSON.stringify({
      notificationId: outbox.id,
      title: outbox.title,
      body: outbox.body,
      targetUrl: outbox.target_url,
      icon: outbox.icon_url || '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: outbox.tag || `studio-flow-${outbox.id}`,
      renotify: true,
      ...outbox.payload,
    })

    let sent = 0
    const errors: string[] = []

    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        }, notification, { TTL: 86400, urgency: 'high' })
        sent += 1
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0)
        errors.push(`${subscription.id}:${statusCode || 'send_error'}`)

        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').update({
            revoked_at: new Date().toISOString(),
          }).eq('id', subscription.id)
        }
      }
    }))

    await admin.from('push_notification_outbox').update({
      status: sent > 0 ? 'sent' : 'failed',
      attempts: Number(outbox.attempts || 0) + 1,
      sent_at: sent > 0 ? new Date().toISOString() : null,
      last_error: errors.length ? errors.join(',').slice(0, 1000) : null,
    }).eq('id', outbox.id)

    return json({ ok: sent > 0, sent, failed: errors.length }, sent > 0 ? 200 : 502)
  } catch (error) {
    if (outboxId) {
      await admin.from('push_notification_outbox').update({
        status: 'failed',
        last_error: String(error?.message || 'Unexpected push error').slice(0, 1000),
      }).eq('id', outboxId).eq('status', 'sending')
    }
    return json({ error: error?.message || 'Unexpected push error' }, 500)
  }
})
