begin;
do $$
declare f regprocedure; d text;
begin
 foreach f in array array['public.studio_flow_admin_get_billing_summary(date,text)'::regprocedure,'public.studio_flow_admin_get_billing_history(text,integer)'::regprocedure] loop
   select pg_get_functiondef(f) into d;
   if position('and s.studio_status = ''approved''' in d)=0 then raise exception 'Unexpected billing studio filter'; end if;
   d:=replace(d,'and s.studio_status = ''approved''','and s.studio_status in (''approved'', ''suspended'')');
   execute d;
 end loop;
end $$;
commit;
