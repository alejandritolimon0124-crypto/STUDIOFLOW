create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  device_label text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_check check (endpoint ~ '^https://'),
  constraint push_subscriptions_key_check check (length(p256dh) between 20 and 255 and length(auth_key) between 8 and 255)
);

create index push_subscriptions_profile_active_idx
on public.push_subscriptions(profile_id)
where revoked_at is null;

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table public.push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  notification_kind text not null,
  title text not null,
  body text not null,
  target_url text not null default '/',
  icon_url text not null default '/pwa-192.png',
  tag text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  delivery_token uuid not null default gen_random_uuid(),
  status text not null default 'queued',
  attempts integer not null default 0,
  process_after timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint push_notification_outbox_dedupe_unique unique (dedupe_key),
  constraint push_notification_outbox_status_check check (status in ('queued', 'sending', 'sent', 'failed', 'no_subscription')),
  constraint push_notification_outbox_target_check check (target_url like '/%')
);

create index push_notification_outbox_pending_idx
on public.push_notification_outbox(status, process_after, created_at)
where status in ('queued', 'failed');

alter table public.push_notification_outbox enable row level security;
revoke all on public.push_notification_outbox from anon, authenticated;

create or replace function public.studio_flow_save_push_subscription(
  p_subscription jsonb,
  p_device_label text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile_id uuid := auth.uid();
  v_endpoint text := p_subscription ->> 'endpoint';
  v_p256dh text := p_subscription #>> '{keys,p256dh}';
  v_auth_key text := p_subscription #>> '{keys,auth}';
  v_id uuid;
begin
  if v_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = v_profile_id and p.status = 'active'
  ) then
    raise exception 'Active authenticated profile required';
  end if;

  if v_endpoint is null or v_endpoint !~ '^https://' or v_p256dh is null or v_auth_key is null then
    raise exception 'Invalid push subscription';
  end if;

  insert into public.push_subscriptions (
    profile_id, endpoint, p256dh, auth_key, device_label, user_agent, last_seen_at, revoked_at, updated_at
  ) values (
    v_profile_id,
    left(v_endpoint, 2048),
    left(v_p256dh, 255),
    left(v_auth_key, 255),
    left(p_device_label, 120),
    left(p_user_agent, 500),
    now(),
    null,
    now()
  )
  on conflict (endpoint) do update set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    device_label = excluded.device_label,
    user_agent = excluded.user_agent,
    last_seen_at = now(),
    revoked_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.studio_flow_remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public, auth
as $$
  update public.push_subscriptions
  set revoked_at = now(), updated_at = now()
  where profile_id = auth.uid() and endpoint = p_endpoint;
$$;

revoke all on function public.studio_flow_save_push_subscription(jsonb, text, text) from public, anon;
revoke all on function public.studio_flow_remove_push_subscription(text) from public, anon;
grant execute on function public.studio_flow_save_push_subscription(jsonb, text, text) to authenticated;
grant execute on function public.studio_flow_remove_push_subscription(text) to authenticated;

create or replace function public.studio_flow_enqueue_push_notification(
  p_profile_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_target_url text,
  p_tag text,
  p_payload jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_profile_id and p.status = 'active'
  ) then
    return;
  end if;

  insert into public.push_notification_outbox (
    profile_id, notification_kind, title, body, target_url, tag, payload, dedupe_key
  ) values (
    p_profile_id,
    left(p_kind, 80),
    left(p_title, 160),
    left(p_body, 500),
    case when p_target_url like '/%' then p_target_url else '/' end,
    left(p_tag, 160),
    coalesce(p_payload, '{}'::jsonb),
    left(p_dedupe_key, 300)
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.studio_flow_enqueue_push_notification(uuid, text, text, text, text, text, jsonb, text)
from public, anon, authenticated;

create or replace function public.studio_flow_dispatch_push_outbox()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url := 'https://ufuoosonbiaqqafeabhu.supabase.co/functions/v1/send-push-notification',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'outboxId', new.id,
      'deliveryToken', new.delivery_token
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.studio_flow_dispatch_push_outbox() from public, anon, authenticated;

drop trigger if exists studio_flow_dispatch_push_outbox_trigger on public.push_notification_outbox;
create trigger studio_flow_dispatch_push_outbox_trigger
after insert on public.push_notification_outbox
for each row execute function public.studio_flow_dispatch_push_outbox();

create or replace function public.studio_flow_queue_appointment_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_service_name text;
  v_when text;
  v_profile_id uuid;
begin
  select coalesce(c.display_name, 'Una clienta'), so.name,
    to_char(new.starts_at at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI')
  into v_client_name, v_service_name, v_when
  from public.clients c
  join public.service_offerings so on so.id = new.service_offering_id
  where c.id = new.client_id;

  if tg_op = 'INSERT'
    and new.status = 'scheduled'
    and new.booking_source in ('client_portal', 'marketplace', 'google')
  then
    select a.profile_id into v_profile_id
    from public.artists a
    where a.id = new.artist_id and a.status = 'active' and a.archived_at is null;

    perform public.studio_flow_enqueue_push_notification(
      v_profile_id,
      'new_appointment',
      'Nueva cita en Studio Flow',
      format('%s reservó %s para el %s.', coalesce(v_client_name, 'Una clienta'), coalesce(v_service_name, 'un servicio'), v_when),
      '/artist/appointments',
      'appointment-' || new.id,
      jsonb_build_object('appointmentId', new.id),
      format('appointment:new:%s:artist:%s', new.id, coalesce(v_profile_id::text, 'none'))
    );

    if new.studio_id is not null then
      for v_profile_id in
        select distinct recipient.profile_id
        from (
          select s.owner_profile_id as profile_id
          from public.studios s
          where s.id = new.studio_id and s.studio_status = 'approved' and s.archived_at is null
          union
          select ura.profile_id
          from public.user_role_assignments ura
          join public.roles r on r.id = ura.role_id
          where ura.studio_id = new.studio_id
            and ura.status = 'active'
            and r.code in ('studio_owner', 'studio_manager')
        ) recipient
      loop
        perform public.studio_flow_enqueue_push_notification(
          v_profile_id,
          'new_studio_appointment',
          'Nueva cita para tu estudio',
          format('%s reservó %s para el %s.', coalesce(v_client_name, 'Una clienta'), coalesce(v_service_name, 'un servicio'), v_when),
          '/admin/studio?section=schedule',
          'appointment-' || new.id,
          jsonb_build_object('appointmentId', new.id, 'studioId', new.studio_id),
          format('appointment:new:%s:studio:%s', new.id, v_profile_id)
        );
      end loop;
    end if;
  end if;

  if tg_op = 'UPDATE'
    and new.confirmation_requested_at is not null
    and new.confirmation_requested_at is distinct from old.confirmation_requested_at
  then
    select c.profile_id into v_profile_id
    from public.clients c
    join public.profiles p on p.id = c.profile_id and p.status = 'active'
    where c.id = new.client_id and c.status = 'active' and c.archived_at is null;

    perform public.studio_flow_enqueue_push_notification(
      v_profile_id,
      'appointment_confirmation',
      'Confirma tu cita en Studio Flow',
      format('Confirma tu asistencia para %s el %s.', coalesce(v_service_name, 'tu servicio'), v_when),
      '/client/appointments',
      'appointment-confirmation-' || new.id,
      jsonb_build_object('appointmentId', new.id),
      format('appointment:confirmation:%s:%s', new.id, new.confirmation_requested_at)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists studio_flow_appointment_push_trigger on public.appointments;
create trigger studio_flow_appointment_push_trigger
after insert or update of confirmation_requested_at on public.appointments
for each row execute function public.studio_flow_queue_appointment_push();

create or replace function public.studio_flow_queue_client_notice_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select c.profile_id into v_profile_id
  from public.clients c
  join public.profiles p on p.id = c.profile_id and p.status = 'active'
  where c.id = new.client_id and c.status = 'active' and c.archived_at is null;

  perform public.studio_flow_enqueue_push_notification(
    v_profile_id,
    new.notification_type,
    new.title,
    new.body,
    '/client',
    'client-notice-' || new.id,
    jsonb_build_object('clientNotificationId', new.id, 'type', new.notification_type),
    'client-notice:' || new.id
  );

  return new;
end;
$$;

drop trigger if exists studio_flow_client_notice_push_trigger on public.client_notifications;
create trigger studio_flow_client_notice_push_trigger
after insert on public.client_notifications
for each row execute function public.studio_flow_queue_client_notice_push();

do $$
begin
  alter publication supabase_realtime add table public.push_notification_outbox;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'studioflow-marketing-reminders';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'studioflow-marketing-reminders',
    '0 15 * * *',
    'select public.studio_flow_generate_marketing_reminders()'
  );
end;
$$;
