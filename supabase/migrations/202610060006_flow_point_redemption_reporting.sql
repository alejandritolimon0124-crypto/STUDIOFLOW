create function public.studio_flow_flow_point_redemptions_report(
  p_type text, p_id uuid, p_year integer default null, p_month integer default null,
  p_query text default '', p_limit integer default 8, p_offset integer default 0
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_artist_id uuid;
  v_is_owner boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_total integer;
  v_points bigint;
  v_items jsonb;
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and status='active') then
    raise exception 'Sesion activa requerida';
  end if;
  if p_type not in ('artist','studio') or (p_type='studio' and p_id is null) then raise exception 'Negocio invalido'; end if;
  if p_type='artist' and p_id is null then
    select id into p_id from artists where profile_id=auth.uid() and status='active' and archived_at is null limit 1;
    if p_id is null then raise exception 'Perfil de artista requerido'; end if;
  end if;
  if (p_year is null) <> (p_month is null) or (p_year is not null and (p_year not between 1900 and 9998 or p_month not between 1 and 12)) then
    raise exception 'Periodo invalido';
  end if;
  select exists(select 1 from user_role_assignments ura join roles r on r.id=ura.role_id
    where ura.profile_id=auth.uid() and ura.status='active' and r.code='platform_owner')
    or exists(select 1 from profiles where id=auth.uid() and default_role='platform_owner') into v_is_owner;
  if not v_is_owner then
    if p_type='studio' then
      perform public.studio_flow_owner_assert_studio_access(p_id);
    else
      select id into v_artist_id from artists where id=p_id and profile_id=auth.uid()
        and status='active' and archived_at is null;
      if v_artist_id is null then raise exception 'Perfil de artista requerido'; end if;
    end if;
  end if;
  if p_year is not null then
    v_start:=make_date(p_year,p_month,1)::timestamp at time zone 'America/Mexico_City';
    v_end:=(make_date(p_year,p_month,1)+interval '1 month')::timestamp at time zone 'America/Mexico_City';
  end if;
  select count(*)::integer,coalesce(sum(r.points),0)::bigint into v_total,v_points
  from flow_point_redemptions r join clients c on c.id=r.client_id
  where ((p_type='studio' and r.studio_id=p_id) or (p_type='artist' and r.artist_id=p_id and r.studio_id is null))
    and (v_start is null or (r.redeemed_at>=v_start and r.redeemed_at<v_end))
    and (nullif(trim(p_query),'') is null or c.display_name ilike '%' || trim(p_query) || '%'
      or r.id::text ilike trim(p_query) || '%');
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'clientName',q.client_name,
    'points',q.points,'redeemedAt',q.redeemed_at) order by q.redeemed_at desc,q.id desc),'[]'::jsonb)
  into v_items from (
    select r.id,c.display_name as client_name,r.points,r.redeemed_at
    from flow_point_redemptions r join clients c on c.id=r.client_id
    where ((p_type='studio' and r.studio_id=p_id) or (p_type='artist' and r.artist_id=p_id and r.studio_id is null))
      and (v_start is null or (r.redeemed_at>=v_start and r.redeemed_at<v_end))
      and (nullif(trim(p_query),'') is null or c.display_name ilike '%' || trim(p_query) || '%'
        or r.id::text ilike trim(p_query) || '%')
    order by r.redeemed_at desc,r.id desc
    limit least(greatest(coalesce(p_limit,8),1),10000) offset greatest(coalesce(p_offset,0),0)
  ) q;
  return jsonb_build_object('items',v_items,'total',v_total,'pointsTotal',v_points);
end $$;
revoke all on function public.studio_flow_flow_point_redemptions_report(text,uuid,integer,integer,text,integer,integer) from public,anon;
grant execute on function public.studio_flow_flow_point_redemptions_report(text,uuid,integer,integer,text,integer,integer) to authenticated;
