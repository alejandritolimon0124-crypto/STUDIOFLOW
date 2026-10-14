begin;

create function public.studio_flow_get_appointment_payment_accounts(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_object_agg(a.id, jsonb_build_object(
    'bankName', b.bank_name,
    'accountHolder', b.account_holder,
    'clabe', b.clabe,
    'terms', b.payment_terms
  )), '{}'::jsonb)
  from public.appointments a
  join public.clients c on c.id = a.client_id and c.profile_id = auth.uid()
  join public.business_payment_settings b
    on b.scope_type = case when a.studio_id is null then 'artist' else 'studio' end
   and b.scope_id = coalesce(a.studio_id, a.artist_id)
  where a.id = any(p_ids)
    and a.status = 'scheduled'
    and b.clabe ~ '^[0-9]{18}$'
    and length(trim(b.bank_name)) > 0
    and length(trim(b.account_holder)) > 0;
$$;

revoke all on function public.studio_flow_get_appointment_payment_accounts(uuid[]) from public;
grant execute on function public.studio_flow_get_appointment_payment_accounts(uuid[]) to authenticated;

create or replace function public.studio_flow_get_appointment_payment_details(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_object_agg(q.id, jsonb_build_object(
    'total', q.gross_amount,
    'original', coalesce(q.price_amount, q.gross_amount),
    'discountPercent', case when q.price_amount > 0 then round((q.price_amount - q.gross_amount) * 100 / q.price_amount, 2) else 0 end,
    'happyHourPercent', q.happy_hour_percent,
    'happyHourDiscount', case when q.happy_hour_percent > 0 and q.price_amount is not null
      then round(q.price_amount * q.happy_hour_percent / 100, 2) else 0 end,
    'points', q.points,
    'pointsDiscount', q.points * 0.10,
    'currency', q.currency
  )), '{}'::jsonb)
  from (
    select a.id, e.gross_amount, e.currency, o.price_amount,
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
  ) q;
$$;

revoke all on function public.studio_flow_get_appointment_payment_details(uuid[]) from public;
grant execute on function public.studio_flow_get_appointment_payment_details(uuid[]) to authenticated;

commit;
