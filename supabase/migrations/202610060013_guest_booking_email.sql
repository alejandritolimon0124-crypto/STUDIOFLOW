begin;

create table public.studio_flow_guest_booking_email_outbox (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id),
  recipient_email text not null,
  delivery_token uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index studio_flow_guest_booking_email_retry_idx
  on public.studio_flow_guest_booking_email_outbox(status,updated_at)
  where status in ('pending','failed');
alter table public.studio_flow_guest_booking_email_outbox enable row level security;
revoke all on public.studio_flow_guest_booking_email_outbox from public,anon,authenticated;

create function public.studio_flow_queue_guest_booking_email(p_appointment_id uuid,p_email text)
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare v_email text:=lower(trim(coalesce(p_email,'')));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return false; end if;
  if not exists(select 1 from public.appointments a join public.clients c on c.id=a.client_id
    where a.id=p_appointment_id and a.status='scheduled' and c.profile_id is null
      and a.booking_source in ('studio','artist') and a.created_by_profile_id is not null) then
    return false;
  end if;
  insert into public.studio_flow_guest_booking_email_outbox(appointment_id,recipient_email)
    values(p_appointment_id,v_email) on conflict(appointment_id) do nothing;
  return true;
end $$;
revoke all on function public.studio_flow_queue_guest_booking_email(uuid,text) from public,anon,authenticated;

create function public.studio_flow_enqueue_guest_booking_email()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_email text;
begin
  if new.booking_source not in ('studio','artist') or new.created_by_profile_id is null then
    return new;
  end if;
  select coalesce(nullif(trim(c.email),''),claim.contact_email) into v_email
    from public.clients c
    left join public.studio_flow_guest_booking_claims claim on claim.guest_client_id=c.id
    where c.id=new.client_id and c.profile_id is null;
  if v_email is not null then
    perform public.studio_flow_queue_guest_booking_email(new.id,v_email);
  end if;
  return new;
end $$;
create trigger studio_flow_enqueue_guest_booking_email
  after insert on public.appointments for each row
  execute function public.studio_flow_enqueue_guest_booking_email();
revoke all on function public.studio_flow_enqueue_guest_booking_email() from public,anon,authenticated;

create function public.studio_flow_dispatch_guest_booking_email()
returns trigger language plpgsql security definer set search_path=public,net as $$
begin
  perform net.http_post(
    url:='https://ufuoosonbiaqqafeabhu.supabase.co/functions/v1/send-guest-booking-email',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('outboxId',new.id,'deliveryToken',new.delivery_token),
    timeout_milliseconds:=5000
  );
  return new;
end $$;
create trigger studio_flow_dispatch_guest_booking_email
  after insert on public.studio_flow_guest_booking_email_outbox for each row
  execute function public.studio_flow_dispatch_guest_booking_email();
revoke all on function public.studio_flow_dispatch_guest_booking_email() from public,anon,authenticated;

create function public.studio_flow_retry_guest_booking_emails()
returns integer language plpgsql security definer set search_path=public,net as $$
declare v_email public.studio_flow_guest_booking_email_outbox%rowtype; v_count integer:=0;
begin
  for v_email in select * from public.studio_flow_guest_booking_email_outbox
    where status in ('pending','failed') and attempts<3
      and updated_at<now()-interval '5 minutes'
    order by created_at limit 50 loop
    perform net.http_post(
      url:='https://ufuoosonbiaqqafeabhu.supabase.co/functions/v1/send-guest-booking-email',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=jsonb_build_object('outboxId',v_email.id,'deliveryToken',v_email.delivery_token),
      timeout_milliseconds:=5000
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.studio_flow_retry_guest_booking_emails() from public,anon,authenticated;
select cron.schedule('studioflow-guest-booking-emails','*/10 * * * *',
  'select public.studio_flow_retry_guest_booking_emails()');

commit;
