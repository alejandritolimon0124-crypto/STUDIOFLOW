-- Audit existing restored records; always roll back, including price changes.
begin;
do $$
declare a record; first_quote jsonb; second_quote jsonb; checked integer:=0;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 for a in select ap.id,ap.service_offering_id from public.appointments ap loop
  first_quote:=public.studio_flow_sync_appointment_commission(a.id);
  if (first_quote->>'platformFeeAmount')::numeric<>round((first_quote->>'grossAmount')::numeric*0.10,2) then raise exception 'Incorrect commission'; end if;
  if (first_quote->>'artistRevenueAmount')::numeric+(first_quote->>'platformFeeAmount')::numeric<>(first_quote->>'grossAmount')::numeric then raise exception 'Revenue mismatch'; end if;
  checked:=checked+1;
 end loop;
 raise notice '10 percent arithmetic and revenue distribution passed for % existing appointments',checked;
 select ap.id,ap.service_offering_id into a from public.appointments ap join public.service_offerings s on s.id=ap.service_offering_id where s.price_amount>0 limit 1;
 if a.id is null then raise exception 'Existing priced appointment required'; end if;
 first_quote:=public.studio_flow_sync_appointment_commission(a.id);
 update public.service_offerings set price_amount=price_amount+100 where id=a.service_offering_id;
 second_quote:=public.studio_flow_sync_appointment_commission(a.id);
 if first_quote->>'grossAmount' is distinct from second_quote->>'grossAmount' then
  raise exception 'Changing service price changed an existing appointment quote';
 end if;
 select ap.id,ap.service_offering_id into a from public.appointments ap
 join public.appointment_economies e on e.appointment_id=ap.id
 where e.calculation_version like '%happy-hour-discount-%' limit 1;
 if a.id is null then raise exception 'Existing discounted appointment required'; end if;
 first_quote:=public.studio_flow_sync_appointment_commission(a.id);
 update public.promotions set rules=jsonb_set(coalesce(rules,'{}'::jsonb),'{discountPercent}','0'::jsonb) where promotion_type='happy_hour' and status='active';
 second_quote:=public.studio_flow_sync_appointment_commission(a.id);
 if first_quote->>'grossAmount' is distinct from second_quote->>'grossAmount' then
  raise exception 'Changing promotion changed an existing appointment quote';
 end if;
 if first_quote->>'happyHourDiscountPercent' is distinct from second_quote->>'happyHourDiscountPercent' then raise exception 'Saved discount percentage changed'; end if;
 raise notice 'Saved quote preserved after service price and promotion changes';
end;$$;
rollback;
