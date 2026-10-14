begin;

create or replace function public.studio_flow_get_appointment_payment_details(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_object_agg(q.id, jsonb_build_object(
    'total', q.gross_amount,
    'original', q.original,
    'discountPercent', case when q.original > 0 then round((q.original - q.gross_amount) * 100 / q.original, 2) else 0 end,
    'happyHourPercent', q.happy_hour_percent,
    'happyHourDiscount', case when q.happy_hour_percent > 0 then q.original - q.gross_amount else 0 end,
    'points', q.points,
    'pointsDiscount', q.points * 0.10,
    'currency', q.currency
  )), '{}'::jsonb)
  from (
    select b.*,
      case
        when b.happy_hour_percent > 0 and b.happy_hour_percent < 100
          then round(b.gross_amount * 100 / (100 - b.happy_hour_percent), 2)
        when b.points > 0 then b.gross_amount + b.points * 0.10
        when b.calculation_version like '%invitation%' then coalesce(b.price_amount, b.gross_amount)
        else b.gross_amount
      end as original
    from (
      select a.id, e.gross_amount, e.currency, e.calculation_version, o.price_amount,
        coalesce(substring(e.calculation_version from 'happy-hour-discount-([0-9]+)$')::numeric, 0) as happy_hour_percent,
        coalesce(l.points, 0) as points
      from public.appointments a
      join public.appointment_economies e on e.appointment_id = a.id
      left join public.service_offerings o on o.id = a.service_offering_id
      left join lateral (
        select sum(-points) as points from public.flow_point_ledger
        where appointment_id = a.id and movement_type = 'spend' and reason = 'reward_redeemed'
      ) l on true
      where a.id = any(p_ids)
        and exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
        and (
          exists (select 1 from public.clients c where c.id = a.client_id and c.profile_id = auth.uid())
          or exists (select 1 from public.artists ar where ar.id = a.artist_id and ar.profile_id = auth.uid())
          or exists (select 1 from public.studios s where s.id = a.studio_id and s.owner_profile_id = auth.uid())
          or exists (select 1 from public.user_role_assignments u join public.roles r on r.id = u.role_id
            where u.profile_id = auth.uid() and u.status = 'active'
              and (r.code = 'platform_owner' or (r.code in ('studio_owner', 'studio_manager') and u.studio_id = a.studio_id)))
        )
    ) b
  ) q;
$$;

revoke all on function public.studio_flow_get_appointment_payment_details(uuid[]) from public;
grant execute on function public.studio_flow_get_appointment_payment_details(uuid[]) to authenticated;

commit;
