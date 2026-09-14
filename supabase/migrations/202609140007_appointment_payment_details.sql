begin;
create function public.studio_flow_get_appointment_payment_details(p_ids uuid[])
returns jsonb language sql stable security definer set search_path=public,auth as $$
 select coalesce(jsonb_object_agg(q.id,jsonb_build_object(
 'total',q.gross_amount,'original',case when q.discount<100 then round(q.gross_amount*100/(100-q.discount),2) else null end,
 'discountPercent',q.discount,'points',q.points,'currency',q.currency)), '{}'::jsonb)
 from (
 select a.id,e.gross_amount,e.currency,
 coalesce(l.discount,substring(e.calculation_version from 'happy-hour-discount-([0-9]+)$')::numeric,0) as discount,
 coalesce(l.points,0) as points
 from appointments a join appointment_economies e on e.appointment_id=a.id
 left join lateral (
 select max((metadata->>'discountPercent')::numeric) as discount,sum(-points) as points
 from flow_point_ledger where appointment_id=a.id and movement_type='spend' and reason='reward_redeemed'
 ) l on true
 where a.id=any(p_ids) and exists(select 1 from profiles where id=auth.uid() and status='active')
 and (
 exists(select 1 from clients c where c.id=a.client_id and c.profile_id=auth.uid())
 or exists(select 1 from artists ar where ar.id=a.artist_id and ar.profile_id=auth.uid())
 or exists(select 1 from studios s where s.id=a.studio_id and s.owner_profile_id=auth.uid())
 or exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id where u.profile_id=auth.uid() and u.status='active' and (r.code='platform_owner' or (r.code in ('studio_owner','studio_manager') and u.studio_id=a.studio_id)))
 )) q;
$$;
revoke all on function public.studio_flow_get_appointment_payment_details(uuid[]) from public;
grant execute on function public.studio_flow_get_appointment_payment_details(uuid[]) to authenticated;
commit;
