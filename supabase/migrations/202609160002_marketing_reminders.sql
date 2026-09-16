create table public.marketing_reminder_preferences (
  artist_id uuid primary key references public.artists(id),
  birthday boolean not null default false,
  reactivation boolean not null default false,
  maintenance boolean not null default false,
  maintenance_days integer not null default 14 check (maintenance_days in (7,14,30)),
  updated_at timestamptz not null default now()
);
alter table public.marketing_reminder_preferences enable row level security;
revoke all on public.marketing_reminder_preferences from anon, authenticated;
alter table public.client_notifications add column reminder_key text;
create unique index client_notification_reminder_key on public.client_notifications(reminder_key);

create function public.studio_flow_marketing_reminder_settings(p_artist_id uuid, p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare a artists%rowtype; result jsonb;
begin
  a := public.studio_flow_artist_current_owned_artist(p_artist_id);
  if p_settings is not null then
    insert into marketing_reminder_preferences(artist_id,birthday,reactivation,maintenance,maintenance_days)
    values(a.id,coalesce((p_settings->>'birthday')::boolean,false),
      coalesce((p_settings->>'reactivation')::boolean,false),
      coalesce((p_settings->>'maintenance')::boolean,false),
      coalesce((p_settings->>'maintenance_days')::integer,14))
    on conflict (artist_id) do update set birthday=excluded.birthday,
      reactivation=excluded.reactivation,maintenance=excluded.maintenance,
      maintenance_days=excluded.maintenance_days,updated_at=now();
  end if;
  select to_jsonb(p) into result from marketing_reminder_preferences p where artist_id=a.id;
  return coalesce(result,'{"birthday":false,"reactivation":false,"maintenance":false,"maintenance_days":14}'::jsonb);
end;
$$;

-- Shared by the private scheduled job and the authenticated client's inbox.
create function public.studio_flow_generate_marketing_reminders(p_client_id uuid default null, p_artist_id uuid default null, p_type text default null)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare inserted integer;
begin
  with visits as (
    select distinct on (ap.artist_id,ap.client_id) ap.artist_id,ap.client_id,ap.id,ap.starts_at
    from appointments ap
    where ap.status='completed' and ap.ends_at<=now()
      and (p_client_id is null or ap.client_id=p_client_id)
      and (p_artist_id is null or ap.artist_id=p_artist_id)
    order by ap.artist_id,ap.client_id,ap.starts_at desc,ap.id
  ), eligible as (
    select v.*, a.display_name, kind,
      case when kind='birthday' then to_char(now() at time zone 'America/Mexico_City','YYYY') else v.id::text end as cycle
    from visits v
    join artists a on a.id=v.artist_id and a.status='active'
    join profiles owner_profile on owner_profile.id=a.profile_id and owner_profile.status='active'
    join clients c on c.id=v.client_id and c.status='active' and c.archived_at is null
    join profiles cp_owner on cp_owner.id=c.profile_id and cp_owner.status='active'
    join marketing_reminder_preferences p on p.artist_id=a.id
    left join client_profiles cp on cp.client_id=c.id
    cross join (values ('birthday'),('reactivation'),('maintenance')) t(kind)
    where (p_type is null or kind=p_type) and (
      (kind='birthday' and p.birthday and to_char(cp.birthday,'MM-DD')=to_char(now() at time zone 'America/Mexico_City','MM-DD'))
      or (kind in ('reactivation','maintenance')
        and ((kind='reactivation' and p.reactivation and v.starts_at<=now()-interval '30 days')
          or (kind='maintenance' and p.maintenance and v.starts_at<=now()-make_interval(days=>p.maintenance_days)))
        and not exists(select 1 from appointments future where future.client_id=v.client_id
          and future.artist_id=v.artist_id and future.status='scheduled' and future.ends_at>now()))
    )
  )
  insert into client_notifications(client_id,artist_id,notification_type,title,body,metadata,reminder_key)
  select client_id,artist_id,kind,
    case kind when 'birthday' then 'Feliz cumpleanos de parte de '||display_name
      when 'reactivation' then display_name||' te espera de vuelta' else 'Tu mantenimiento con '||display_name end,
    case kind when 'birthday' then 'Te deseamos un maravilloso cumpleanos. Gracias por ser parte de Studio Flow.'
      when 'reactivation' then 'Hace tiempo que no nos visitas. Nos encantaria recibirte de nuevo cuando lo desees.'
      else 'Es momento de considerar tu siguiente mantenimiento. Agenda cuando te resulte conveniente.' end,
    jsonb_build_object('lastAppointmentId',id),
    artist_id::text||':'||client_id::text||':'||kind||':'||cycle
  from eligible on conflict (reminder_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace function public.studio_flow_artist_send_marketing_notification(p_type text,p_maintenance_days integer default 14,p_artist_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare a artists%rowtype;
begin
  a := public.studio_flow_artist_current_owned_artist(p_artist_id);
  if p_type is null or p_type not in ('birthday','reactivation','maintenance') then raise exception 'Tipo de aviso invalido'; end if;
  return jsonb_build_object('insertedCount',public.studio_flow_generate_marketing_reminders(null,a.id,p_type));
end;
$$;
-- The legacy signature must use the same deduplicated implementation.
create or replace function public.studio_flow_artist_send_marketing_notification(p_type text,p_maintenance_days integer default 14)
returns jsonb language sql security definer set search_path=public,auth as $$
  select public.studio_flow_artist_send_marketing_notification(p_type,p_maintenance_days,null::uuid);
$$;

create or replace function public.studio_flow_client_get_notifications()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare client_id_value uuid; result jsonb;
begin
  select c.id into client_id_value from clients c join profiles p on p.id=c.profile_id
    where c.profile_id=auth.uid() and c.status='active' and c.archived_at is null and p.status='active';
  if client_id_value is null then raise exception 'Se requiere una clienta activa'; end if;
  perform public.studio_flow_generate_marketing_reminders(client_id_value);
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) into result
    from (select id,title,body,created_at,read_at from client_notifications
      where client_id=client_id_value order by created_at desc,id limit 30) n;
  return jsonb_build_object('notifications',result);
end;
$$;

create function public.studio_flow_client_read_marketing_notice(p_id uuid)
returns void language sql security definer set search_path=public,auth as $$
  update client_notifications set read_at=coalesce(read_at,now()) where id=p_id and client_id in
    (select c.id from clients c join profiles p on p.id=c.profile_id
      where c.profile_id=auth.uid() and c.status='active' and c.archived_at is null and p.status='active');
$$;
revoke all on function public.studio_flow_generate_marketing_reminders(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.studio_flow_generate_marketing_reminders(uuid,uuid,text) to postgres;
revoke all on function public.studio_flow_marketing_reminder_settings(uuid,jsonb) from public,anon;
revoke all on function public.studio_flow_client_read_marketing_notice(uuid) from public,anon;
grant execute on function public.studio_flow_marketing_reminder_settings(uuid,jsonb) to authenticated;
grant execute on function public.studio_flow_client_read_marketing_notice(uuid) to authenticated;

-- No extension or paid service is activated. Inbox generation also works without cron.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('studioflow-marketing-reminders','0 15 * * *',
      'select public.studio_flow_generate_marketing_reminders()');
  end if;
end $$;
