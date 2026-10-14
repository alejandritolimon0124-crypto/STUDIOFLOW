-- Preserve the original six-month report and refine its acquisition channels.
alter function public.studio_flow_growth_metrics_internal(uuid,uuid,integer)
  rename to studio_flow_growth_metrics_base;

create function public.studio_flow_growth_metrics_internal(
  p_artist_id uuid, p_studio_id uuid, p_months integer default 6
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_base jsonb; v_month date := date_trunc('month', now() at time zone 'America/Mexico_City')::date;
  v_card_first_clients integer := 0; v_card_first_revenue numeric := 0;
  v_card_returning_clients integer := 0; v_card_returning_revenue numeric := 0;
  v_card_bookings integer := 0; v_card_discount numeric := 0;
  v_channel_series jsonb := '[]'::jsonb;
begin
  v_base := public.studio_flow_growth_metrics_base(p_artist_id,p_studio_id,p_months);
  with scoped as (
    select a.id, a.client_id, a.status, a.starts_at,
      (a.starts_at at time zone 'America/Mexico_City')::date as local_day,
      coalesce(e.gross_amount,0) as amount,
      row_number() over (partition by a.client_id order by a.starts_at,a.id) as visit_number,
      first_value(a.id) over (partition by a.client_id order by a.starts_at,a.id) as first_appointment_id
    from public.appointments a left join public.appointment_economies e on e.appointment_id = a.id
    where (p_studio_id is not null and a.studio_id = p_studio_id)
      or (p_artist_id is not null and a.artist_id = p_artist_id and a.studio_id is null)
  ), marked as (
    select s.*, ib.card_id, ib.discount_amount,
      first_ib.card_id as first_card_id
    from scoped s
    left join public.studio_flow_invitation_bookings ib on ib.appointment_id = s.id and ib.voided_at is null
    left join public.studio_flow_invitation_bookings first_ib
      on first_ib.appointment_id = s.first_appointment_id and first_ib.voided_at is null
    where s.local_day >= v_month and s.local_day < (v_month + interval '1 month')::date
  )
  select count(distinct client_id) filter (where status = 'completed' and visit_number = 1 and first_card_id is not null),
    coalesce(sum(amount) filter (where status = 'completed' and visit_number = 1 and first_card_id is not null),0),
    count(distinct client_id) filter (where status = 'completed' and visit_number > 1 and first_card_id is not null),
    coalesce(sum(amount) filter (where status = 'completed' and visit_number > 1 and first_card_id is not null),0),
    count(*) filter (where status = 'completed' and card_id is not null),
    coalesce(sum(discount_amount) filter (where status = 'completed' and card_id is not null),0)
  into v_card_first_clients,v_card_first_revenue,v_card_returning_clients,
    v_card_returning_revenue,v_card_bookings,v_card_discount
  from marked;

  with scoped as (
    select a.id, a.client_id, a.status, a.booking_source::text as source,
      to_char(a.starts_at at time zone 'America/Mexico_City','YYYY-MM') as month,
      row_number() over (partition by a.client_id order by a.starts_at,a.id) as visit_number
    from public.appointments a
    where (p_studio_id is not null and a.studio_id = p_studio_id)
      or (p_artist_id is not null and a.artist_id = p_artist_id and a.studio_id is null)
  ), monthly as (
    select s.month,
      count(distinct s.client_id) filter (where s.status = 'completed' and s.visit_number = 1
        and s.source = 'marketplace' and ib.card_id is null) as search_first,
      count(distinct s.client_id) filter (where s.status = 'completed' and s.visit_number = 1
        and ib.card_id is not null) as invitation_first
    from scoped s left join public.studio_flow_invitation_bookings ib
      on ib.appointment_id = s.id and ib.voided_at is null
    group by s.month
  )
  select coalesce(jsonb_agg(jsonb_build_object('month',m.value->>'month',
    'searchFirst',coalesce(x.search_first,0),'invitationFirst',coalesce(x.invitation_first,0))
    order by m.value->>'month'),'[]'::jsonb) into v_channel_series
  from jsonb_array_elements(v_base->'series') m(value)
  left join monthly x on x.month = m.value->>'month';

  return v_base || jsonb_build_object(
    'searchFirstClients', greatest((v_base->>'marketplaceFirstClients')::integer - v_card_first_clients,0),
    'searchFirstRevenue', greatest((v_base->>'marketplaceFirstRevenue')::numeric - v_card_first_revenue,0),
    'searchReturningClients', greatest((v_base->>'marketplaceReturningClients')::integer - v_card_returning_clients,0),
    'searchReturningRevenue', greatest((v_base->>'marketplaceReturningRevenue')::numeric - v_card_returning_revenue,0),
    'invitationFirstClients', v_card_first_clients,
    'invitationFirstRevenue', v_card_first_revenue,
    'invitationReturningClients', v_card_returning_clients,
    'invitationReturningRevenue', v_card_returning_revenue,
    'invitationBookings', v_card_bookings,
    'invitationDiscountAmount', v_card_discount,
    'channelSeries', v_channel_series,
    'firstBookingSources', (v_base->'firstBookingSources') || jsonb_build_object(
      'marketplace', greatest(coalesce((v_base->'firstBookingSources'->>'marketplace')::integer,0) - v_card_first_clients,0),
      'invitationCard',v_card_first_clients)
  );
end $$;
revoke all on function public.studio_flow_growth_metrics_internal(uuid,uuid,integer) from public, anon, authenticated;
