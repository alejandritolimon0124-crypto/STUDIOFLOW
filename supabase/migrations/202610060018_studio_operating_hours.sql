create table public.studio_operating_hours (
  studio_id uuid not null references public.studios(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  is_open boolean not null default false,
  opens_at time,
  closes_at time,
  breaks jsonb not null default '[]'::jsonb,
  primary key (studio_id, weekday),
  check (not is_open or (opens_at is not null and closes_at > opens_at)),
  check (jsonb_typeof(breaks) = 'array')
);
alter table public.studio_operating_hours enable row level security;
revoke all on public.studio_operating_hours from public, anon, authenticated;

alter table public.availability_slots add column studio_restricted boolean not null default false;

create function public.studio_flow_studio_allows_interval(
  p_studio_id uuid, p_start timestamptz, p_end timestamptz
) returns boolean language sql stable security definer set search_path=public as $$
  select p_studio_id is null or not exists (
    select 1 from studio_operating_hours where studio_id=p_studio_id
  ) or exists (
    select 1 from studio_operating_hours h
    where h.studio_id=p_studio_id
      and h.weekday=extract(dow from p_start at time zone 'America/Mexico_City')::integer
      and h.is_open
      and (p_start at time zone 'America/Mexico_City')::date=(p_end at time zone 'America/Mexico_City')::date
      and (p_start at time zone 'America/Mexico_City')::time>=h.opens_at
      and (p_end at time zone 'America/Mexico_City')::time<=h.closes_at
      and not exists (
        select 1 from jsonb_array_elements(h.breaks) b
        where (p_start at time zone 'America/Mexico_City')::time < (b->>'end')::time
          and (p_end at time zone 'America/Mexico_City')::time > (b->>'start')::time
      )
  );
$$;
revoke all on function public.studio_flow_studio_allows_interval(uuid,timestamptz,timestamptz) from public;

create function public.studio_flow_get_studio_hours(p_studio_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_authorized boolean;
begin
  select exists(select 1 from studios where id=p_studio_id and owner_profile_id=auth.uid())
    or exists(select 1 from artist_studio_memberships m join artists a on a.id=m.artist_id
      where m.studio_id=p_studio_id and m.status='active' and m.archived_at is null and a.profile_id=auth.uid())
  into v_authorized;
  if not coalesce(v_authorized,false) then raise exception 'No tienes acceso al horario de este estudio'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('weekday',weekday,'open',is_open,
    'start',to_char(opens_at,'HH24:MI'),'end',to_char(closes_at,'HH24:MI'),'breaks',breaks) order by weekday)
    from studio_operating_hours where studio_id=p_studio_id),'[]'::jsonb);
end $$;
revoke all on function public.studio_flow_get_studio_hours(uuid) from public,anon;
grant execute on function public.studio_flow_get_studio_hours(uuid) to authenticated;

create function public.studio_flow_save_studio_hours(p_studio_id uuid,p_days jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare d jsonb; b jsonb; v_day integer; v_open boolean; v_start time; v_end time;
  v_break_start time; v_break_end time; v_count integer := 0;
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> 7 then
    raise exception 'Configura los siete dias de la semana';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_studio_id::text,0));
  for d in select * from jsonb_array_elements(p_days) loop
    v_day := (d->>'weekday')::integer;
    if v_day not between 0 and 6 then raise exception 'Dia de la semana no valido'; end if;
    v_count := v_count + 1;
    v_open := coalesce((d->>'open')::boolean,false);
    v_start := nullif(d->>'start','')::time;
    v_end := nullif(d->>'end','')::time;
    if v_open and (v_start is null or v_end is null or v_end<=v_start) then
      raise exception 'Revisa las horas de apertura y cierre';
    end if;
    if jsonb_typeof(coalesce(d->'breaks','[]'::jsonb)) <> 'array' then
      raise exception 'Descansos no validos';
    end if;
    for b in select * from jsonb_array_elements(coalesce(d->'breaks','[]'::jsonb)) loop
      v_break_start := nullif(b->>'start','')::time;
      v_break_end := nullif(b->>'end','')::time;
      if not v_open or v_break_start is null or v_break_end is null
         or v_break_start < v_start or v_break_end > v_end or v_break_end <= v_break_start then
        raise exception 'Cada descanso debe estar dentro del horario abierto';
      end if;
    end loop;
    insert into studio_operating_hours(studio_id,weekday,is_open,opens_at,closes_at,breaks)
    values(p_studio_id,v_day,v_open,v_start,v_end,coalesce(d->'breaks','[]'::jsonb))
    on conflict(studio_id,weekday) do update set is_open=excluded.is_open,
      opens_at=excluded.opens_at,closes_at=excluded.closes_at,breaks=excluded.breaks;
  end loop;
  if (select count(*) from studio_operating_hours where studio_id=p_studio_id) <> 7 then
    raise exception 'Los dias no pueden repetirse';
  end if;
  update availability_slots s set
    status=case
      when not public.studio_flow_studio_allows_interval(s.studio_id,s.starts_at,s.ends_at)
        and s.status='available' then 'hidden'::availability_slot_status
      when s.studio_restricted and s.status='hidden'
        and public.studio_flow_studio_allows_interval(s.studio_id,s.starts_at,s.ends_at)
        then 'available'::availability_slot_status
      else s.status end,
    studio_restricted=not public.studio_flow_studio_allows_interval(s.studio_id,s.starts_at,s.ends_at)
  where s.studio_id=p_studio_id and s.starts_at>now() and s.status in ('available','hidden');
  return public.studio_flow_get_studio_hours(p_studio_id);
end $$;
revoke all on function public.studio_flow_save_studio_hours(uuid,jsonb) from public,anon;
grant execute on function public.studio_flow_save_studio_hours(uuid,jsonb) to authenticated;

create function public.studio_flow_limit_studio_slot()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.studio_id is not null and new.status='available' then
    new.studio_restricted:=not public.studio_flow_studio_allows_interval(new.studio_id,new.starts_at,new.ends_at);
    if new.studio_restricted then new.status:='hidden'; end if;
  end if;
  return new;
end $$;
create trigger studio_flow_limit_studio_slot before insert on public.availability_slots
for each row execute function public.studio_flow_limit_studio_slot();

do $$
declare d text; target text := 'and p_end > slot.starts_at';
begin
  select pg_get_functiondef('public.studio_flow_slot_obeys_booking_rules(uuid,timestamptz)'::regprocedure) into d;
  if position(target in d)=0 then raise exception 'Booking guard definition changed'; end if;
  execute replace(d,target,target || E'\n and public.studio_flow_studio_allows_interval(slot.studio_id,slot.starts_at,p_end)');
end $$;
