-- Independent marketing belongs to the artist; studio marketing belongs to its owner.
create or replace function public.studio_flow_marketing_reminder_settings(
  p_artist_id uuid, p_settings jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_artist artists%rowtype;
  v_item jsonb;
  v_service_id uuid;
  v_days integer;
  v_seen uuid[] := array[]::uuid[];
  v_preferences jsonb;
  v_services jsonb;
  v_rules jsonb;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);
  if p_settings is not null then
    insert into marketing_reminder_preferences(artist_id,birthday,reactivation,maintenance,maintenance_days)
    values(v_artist.id,coalesce((p_settings->>'birthday')::boolean,false),
      coalesce((p_settings->>'reactivation')::boolean,false),false,14)
    on conflict (artist_id) do update set birthday=excluded.birthday,
      reactivation=excluded.reactivation,maintenance=false,updated_at=now();
    if p_settings ? 'maintenanceRules' then
      if jsonb_typeof(p_settings->'maintenanceRules') <> 'array'
        or jsonb_array_length(p_settings->'maintenanceRules') > 50 then
        raise exception 'Configuracion de mantenimiento invalida';
      end if;
      for v_item in select value from jsonb_array_elements(p_settings->'maintenanceRules') loop
        v_service_id := (v_item->>'serviceOfferingId')::uuid;
        v_days := (v_item->>'days')::integer;
        if v_service_id is null or v_days is null or v_days not in (7,14,30)
          or v_service_id = any(v_seen) then
          raise exception 'Cada servicio requiere un solo plazo de 7, 14 o 30 dias';
        end if;
        if not exists(select 1 from service_offerings so where so.id=v_service_id
          and so.owner_type='artist' and so.artist_id=v_artist.id
          and so.status='active' and so.archived_at is null) then
          raise exception 'El servicio no pertenece a tu perfil independiente';
        end if;
        v_seen := array_append(v_seen,v_service_id);
        insert into marketing_maintenance_rules(artist_id,service_offering_id,days)
        values(v_artist.id,v_service_id,v_days)
        on conflict (artist_id,service_offering_id) do update set days=excluded.days,updated_at=now();
      end loop;
      delete from marketing_maintenance_rules where artist_id=v_artist.id
        and not (service_offering_id=any(v_seen));
    end if;
  end if;
  select to_jsonb(p) into v_preferences from marketing_reminder_preferences p where p.artist_id=v_artist.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',so.id,'name',so.name) order by so.name),'[]'::jsonb)
    into v_services from service_offerings so where so.owner_type='artist'
      and so.artist_id=v_artist.id and so.status='active' and so.archived_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('serviceOfferingId',r.service_offering_id,'days',r.days)
    order by so.name),'[]'::jsonb) into v_rules
  from marketing_maintenance_rules r join service_offerings so on so.id=r.service_offering_id
  where r.artist_id=v_artist.id and so.owner_type='artist' and so.artist_id=v_artist.id
    and so.status='active' and so.archived_at is null;
  return coalesce(v_preferences,'{"birthday":false,"reactivation":false}'::jsonb)
    || jsonb_build_object('services',v_services,'maintenanceRules',v_rules);
end $$;

create table public.studio_marketing_reminder_preferences (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  birthday boolean not null default false,
  reactivation boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.studio_marketing_maintenance_rules (
  studio_id uuid not null references public.studios(id) on delete cascade,
  service_offering_id uuid not null references public.service_offerings(id) on delete cascade,
  days integer not null check (days in (7,14,30)),
  updated_at timestamptz not null default now(),
  primary key (studio_id,service_offering_id)
);
alter table public.studio_marketing_reminder_preferences enable row level security;
alter table public.studio_marketing_maintenance_rules enable row level security;
revoke all on public.studio_marketing_reminder_preferences from public,anon,authenticated;
revoke all on public.studio_marketing_maintenance_rules from public,anon,authenticated;

create function public.studio_flow_studio_marketing_reminder_settings(
  p_studio_id uuid, p_settings jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_studio_id uuid;
  v_item jsonb;
  v_service_id uuid;
  v_days integer;
  v_seen uuid[] := array[]::uuid[];
  v_preferences jsonb;
  v_services jsonb;
  v_rules jsonb;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);
  if p_settings is not null then
    insert into studio_marketing_reminder_preferences(studio_id,birthday,reactivation)
    values(v_studio_id,coalesce((p_settings->>'birthday')::boolean,false),
      coalesce((p_settings->>'reactivation')::boolean,false))
    on conflict (studio_id) do update set birthday=excluded.birthday,
      reactivation=excluded.reactivation,updated_at=now();
    if p_settings ? 'maintenanceRules' then
      if jsonb_typeof(p_settings->'maintenanceRules') <> 'array'
        or jsonb_array_length(p_settings->'maintenanceRules') > 50 then
        raise exception 'Configuracion de mantenimiento invalida';
      end if;
      for v_item in select value from jsonb_array_elements(p_settings->'maintenanceRules') loop
        v_service_id := (v_item->>'serviceOfferingId')::uuid;
        v_days := (v_item->>'days')::integer;
        if v_service_id is null or v_days is null or v_days not in (7,14,30)
          or v_service_id=any(v_seen) then
          raise exception 'Cada servicio requiere un solo plazo de 7, 14 o 30 dias';
        end if;
        if not exists(select 1 from service_offerings so
          left join artist_studio_memberships m on m.id=so.membership_id
          where so.id=v_service_id and so.studio_id=v_studio_id
            and so.status='active' and so.archived_at is null
            and (so.owner_type='studio' or (so.owner_type='membership'
              and m.studio_id=v_studio_id and m.status='active' and m.archived_at is null))) then
          raise exception 'El servicio no pertenece a este estudio';
        end if;
        v_seen := array_append(v_seen,v_service_id);
        insert into studio_marketing_maintenance_rules(studio_id,service_offering_id,days)
        values(v_studio_id,v_service_id,v_days)
        on conflict (studio_id,service_offering_id) do update set days=excluded.days,updated_at=now();
      end loop;
      delete from studio_marketing_maintenance_rules where studio_id=v_studio_id
        and not (service_offering_id=any(v_seen));
    end if;
  end if;
  select to_jsonb(p) into v_preferences from studio_marketing_reminder_preferences p where p.studio_id=v_studio_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',so.id,'name',so.name) order by so.name),'[]'::jsonb)
    into v_services from service_offerings so
    left join artist_studio_memberships m on m.id=so.membership_id
    where so.studio_id=v_studio_id and so.status='active' and so.archived_at is null
      and (so.owner_type='studio' or (so.owner_type='membership' and m.studio_id=v_studio_id
        and m.status='active' and m.archived_at is null));
  select coalesce(jsonb_agg(jsonb_build_object('serviceOfferingId',r.service_offering_id,'days',r.days)
    order by so.name),'[]'::jsonb) into v_rules
  from studio_marketing_maintenance_rules r join service_offerings so on so.id=r.service_offering_id
  where r.studio_id=v_studio_id and so.studio_id=v_studio_id
    and so.status='active' and so.archived_at is null;
  return coalesce(v_preferences,'{"birthday":false,"reactivation":false}'::jsonb)
    || jsonb_build_object('services',v_services,'maintenanceRules',v_rules);
end $$;
revoke all on function public.studio_flow_studio_marketing_reminder_settings(uuid,jsonb) from public,anon;
grant execute on function public.studio_flow_studio_marketing_reminder_settings(uuid,jsonb) to authenticated;

-- The existing artist generator must never count a studio visit as an independent visit.
do $$ declare v_sql text;
begin
  select pg_get_functiondef('public.studio_flow_generate_marketing_reminders(uuid,uuid,text)'::regprocedure) into v_sql;
  if (length(v_sql)-length(replace(v_sql,'where ap.status=''completed'' and ap.ends_at<=now()','')))
    / length('where ap.status=''completed'' and ap.ends_at<=now()') <> 2 then
    raise exception 'Review reminder generator before applying scope';
  end if;
  v_sql := replace(v_sql,'where ap.status=''completed'' and ap.ends_at<=now()',
    'where ap.status=''completed'' and ap.ends_at<=now() and ap.studio_id is null and ap.membership_id is null');
  execute v_sql;
end $$;

create function public.studio_flow_generate_studio_marketing_reminders(p_client_id uuid default null)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_inserted integer;
begin
  with last_visit as (
    select distinct on (ap.studio_id,ap.client_id) ap.studio_id,ap.client_id,ap.id,ap.starts_at
    from appointments ap where ap.studio_id is not null and ap.status='completed' and ap.ends_at<=now()
      and (p_client_id is null or ap.client_id=p_client_id)
    order by ap.studio_id,ap.client_id,ap.starts_at desc,ap.id desc
  ), general_notices as (
    select v.studio_id,v.client_id,kind,
      case kind when 'birthday' then 'Feliz cumpleanos de parte de '||s.name
        else s.name||' te espera de vuelta' end as title,
      case kind when 'birthday' then 'Te deseamos un maravilloso cumpleanos. Gracias por ser parte de Studio Flow.'
        else 'Hace tiempo que no nos visitas. Nos encantaria recibirte de nuevo cuando lo desees.' end as body,
      jsonb_build_object('lastAppointmentId',v.id) as metadata,
      v.studio_id::text||':'||v.client_id::text||':'||kind||':'||
        case when kind='birthday' then to_char(now() at time zone 'America/Mexico_City','YYYY') else v.id::text end as reminder_key
    from last_visit v join studios s on s.id=v.studio_id and s.archived_at is null
    join clients c on c.id=v.client_id and c.status='active' and c.archived_at is null
    join studio_marketing_reminder_preferences p on p.studio_id=v.studio_id
    left join client_profiles cp on cp.client_id=c.id
    cross join (values ('birthday'),('reactivation')) kinds(kind)
    where (kind='birthday' and p.birthday and to_char(cp.birthday,'MM-DD')=to_char(now() at time zone 'America/Mexico_City','MM-DD'))
      or (kind='reactivation' and p.reactivation and v.starts_at<=now()-interval '30 days'
        and not exists(select 1 from appointments future where future.client_id=v.client_id
          and future.studio_id=v.studio_id and future.status='scheduled' and future.ends_at>now()))
  ), last_service_visit as (
    select distinct on (ap.studio_id,ap.client_id,ap.service_offering_id)
      ap.studio_id,ap.client_id,ap.service_offering_id,ap.id,ap.ends_at
    from appointments ap where ap.studio_id is not null and ap.status='completed' and ap.ends_at<=now()
      and ap.service_offering_id is not null and (p_client_id is null or ap.client_id=p_client_id)
    order by ap.studio_id,ap.client_id,ap.service_offering_id,ap.ends_at desc,ap.id desc
  ), maintenance_notices as (
    select v.studio_id,v.client_id,'maintenance'::text as kind,
      'Tu proximo mantenimiento: '||so.name as title,
      'Ya toca el mantenimiento de '||so.name||' con '||s.name||'. Elige tu horario en Studio Flow.' as body,
      jsonb_build_object('lastAppointmentId',v.id,'serviceOfferingId',v.service_offering_id) as metadata,
      v.studio_id::text||':'||v.client_id::text||':maintenance:'||v.service_offering_id::text||':'||v.id::text as reminder_key
    from last_service_visit v join studio_marketing_maintenance_rules r
      on r.studio_id=v.studio_id and r.service_offering_id=v.service_offering_id
    join service_offerings so on so.id=v.service_offering_id and so.status='active' and so.archived_at is null
    join studios s on s.id=v.studio_id and s.archived_at is null
    join clients c on c.id=v.client_id and c.status='active' and c.archived_at is null
    where ((now() at time zone 'America/Mexico_City')::date
      - (v.ends_at at time zone 'America/Mexico_City')::date) between r.days and r.days+6
      and not exists(select 1 from appointments future where future.client_id=v.client_id
        and future.studio_id=v.studio_id and future.service_offering_id=v.service_offering_id
        and future.status='scheduled' and future.ends_at>now())
      and not exists(select 1 from client_notifications prior where prior.client_id=v.client_id
        and prior.studio_id=v.studio_id and prior.notification_type='maintenance'
        and prior.metadata->>'lastAppointmentId'=v.id::text)
  ), notices as (select * from general_notices union all select * from maintenance_notices)
  insert into client_notifications(client_id,studio_id,notification_type,title,body,metadata,reminder_key)
  select client_id,studio_id,kind,title,body,metadata,reminder_key from notices
  on conflict (reminder_key) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end $$;
revoke all on function public.studio_flow_generate_studio_marketing_reminders(uuid) from public,anon,authenticated;
grant execute on function public.studio_flow_generate_studio_marketing_reminders(uuid) to postgres;

do $$ declare v_sql text;
begin
  select pg_get_functiondef('public.studio_flow_client_get_notifications()'::regprocedure) into v_sql;
  if position('perform public.studio_flow_generate_marketing_reminders(client_id_value);' in v_sql)=0 then
    raise exception 'Review client notification inbox before adding studio reminders';
  end if;
  v_sql := replace(v_sql,'perform public.studio_flow_generate_marketing_reminders(client_id_value);',
    'perform public.studio_flow_generate_marketing_reminders(client_id_value); perform public.studio_flow_generate_studio_marketing_reminders(client_id_value);');
  execute v_sql;
end $$;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('studioflow-studio-marketing-reminders','0 15 * * *',
      'select public.studio_flow_generate_studio_marketing_reminders()');
  end if;
end $$;
