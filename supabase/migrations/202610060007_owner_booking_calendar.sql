create function public.studio_flow_owner_booking_calendar(
  p_studio_id uuid, p_membership_id uuid, p_month date,
  p_service_offering_id uuid default null, p_date date default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_studio_id uuid;
  v_artist_id uuid;
  v_duration integer;
  v_month date;
  v_days jsonb;
  v_slots jsonb := '[]'::jsonb;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);
  select artist_id into v_artist_id from artist_studio_memberships
  where id=p_membership_id and studio_id=v_studio_id and status='active' and archived_at is null;
  if v_artist_id is null then raise exception 'Artista activa requerida'; end if;
  v_month := date_trunc('month',coalesce(p_month,current_date))::date;
  if v_month < date_trunc('month',now() at time zone 'America/Mexico_City')::date
     or v_month > (date_trunc('month',now() at time zone 'America/Mexico_City')+interval '12 months')::date then
    raise exception 'Mes fuera del periodo de reserva';
  end if;
  select coalesce(jsonb_agg(d.day order by d.day),'[]'::jsonb) into v_days from (
    select distinct (slot.starts_at at time zone 'America/Mexico_City')::date as day
    from availability_slots slot
    where slot.membership_id=p_membership_id and slot.studio_id=v_studio_id
      and slot.artist_id=v_artist_id and slot.status='available' and slot.starts_at>now()
      and (slot.starts_at at time zone 'America/Mexico_City')::date>=v_month
      and (slot.starts_at at time zone 'America/Mexico_City')::date<(v_month+interval '1 month')::date
  ) d;
  if p_service_offering_id is not null and p_date is not null then
    if p_date < v_month or p_date >= (v_month+interval '1 month')::date then raise exception 'Dia fuera del mes'; end if;
    select duration_minutes into v_duration from service_offerings
    where id=p_service_offering_id and owner_type='membership' and membership_id=p_membership_id
      and status='active' and archived_at is null;
    if coalesce(v_duration,0)<=0 then raise exception 'Servicio activo requerido'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',candidate.id,'date',p_date,'time',to_char(candidate.starts_at at time zone 'America/Mexico_City','HH24:MI'),
      'end',to_char(candidate.candidate_end at time zone 'America/Mexico_City','HH24:MI'))
      order by candidate.starts_at),'[]'::jsonb) into v_slots
    from (
      select slot.id,slot.schedule_id,slot.starts_at,
        slot.starts_at+make_interval(mins=>v_duration) as candidate_end
      from availability_slots slot
      where slot.membership_id=p_membership_id and slot.studio_id=v_studio_id
        and slot.artist_id=v_artist_id and slot.status='available' and slot.starts_at>now()
        and (slot.starts_at at time zone 'America/Mexico_City')::date=p_date
    ) candidate
    cross join lateral (
      select min(ordered.starts_at) as first_start,max(ordered.ends_at) as coverage_end,
        coalesce(bool_or(ordered.next_start is not null and ordered.next_start>ordered.ends_at),false) as has_gap
      from (
        select covered.starts_at,covered.ends_at,
          lead(covered.starts_at) over(order by covered.starts_at) as next_start
        from availability_slots covered
        where covered.membership_id=p_membership_id and covered.studio_id=v_studio_id
          and covered.artist_id=v_artist_id and covered.schedule_id=candidate.schedule_id
          and covered.status='available' and covered.starts_at>=candidate.starts_at
          and covered.starts_at<candidate.candidate_end
      ) ordered
    ) coverage
    where coverage.first_start=candidate.starts_at and coverage.coverage_end>=candidate.candidate_end
      and not coverage.has_gap
      and not exists(select 1 from appointments appointment
        where appointment.artist_id=v_artist_id and appointment.status in ('scheduled','disputed')
          and appointment.starts_at<candidate.candidate_end and appointment.ends_at>candidate.starts_at);
  end if;
  return jsonb_build_object('days',v_days,'slots',v_slots);
end $$;
revoke all on function public.studio_flow_owner_booking_calendar(uuid,uuid,date,uuid,date) from public,anon;
grant execute on function public.studio_flow_owner_booking_calendar(uuid,uuid,date,uuid,date) to authenticated;
