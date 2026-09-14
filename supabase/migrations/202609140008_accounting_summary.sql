begin;
create or replace function public.studio_flow_get_accounting_summary(p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare artist uuid; today date:=(now() at time zone 'America/Mexico_City')::date;
 month_start date; week_start date; previous_month date; result jsonb;
begin
 if not exists(select 1 from profiles where id=auth.uid() and status='active') then raise exception 'Sesion activa requerida'; end if;
 if p_studio_id is not null then
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
 else
  select id into artist from artists where profile_id=auth.uid() and archived_at is null;
  if artist is null then raise exception 'Perfil de artista requerido'; end if;
 end if;
 month_start:=date_trunc('month',today)::date;
 week_start:=date_trunc('week',today)::date;
 previous_month:=(month_start-interval '1 month')::date;
 with amounts as (
 select (a.starts_at at time zone 'America/Mexico_City')::date as day,e.gross_amount,round(e.gross_amount*0.10,2) as fee
 from appointments a join appointment_economies e on e.appointment_id=a.id
 where a.status='completed' and (
 (p_studio_id is not null and a.studio_id=p_studio_id)
 or (p_studio_id is null and a.artist_id=artist and a.studio_id is null))
 ), totals as (
 select coalesce(sum(gross_amount) filter(where day=today),0) as daily,
 coalesce(sum(gross_amount) filter(where day between week_start and today),0) as weekly,
 coalesce(sum(gross_amount) filter(where day between month_start and today),0) as monthly,
 coalesce(sum(gross_amount) filter(where day>=previous_month and day<month_start),0) as previous,
 coalesce(sum(fee) filter(where day>=previous_month and day<month_start),0) as previous_fee,
 coalesce(sum(fee) filter(where day between month_start and today),0) as monthly_fee,
 count(*) filter(where day=today) as daily_count from amounts)
 select jsonb_build_object('date',today,'weekStart',week_start,'monthStart',month_start,
 'receiptMonth',previous_month,'dueDate',month_start+4,'daily',daily,'weekly',weekly,
 'monthly',monthly,'dailyCount',daily_count,'receiptIncome',previous,
 'commission',previous_fee,'monthCommission',monthly_fee) into result from totals;
 return result;
end;$$;
revoke all on function public.studio_flow_get_accounting_summary(uuid) from public;
grant execute on function public.studio_flow_get_accounting_summary(uuid) to authenticated;
commit;
