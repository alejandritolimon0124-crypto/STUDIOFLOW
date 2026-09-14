begin;
alter table public.schedule_rules add column breaks jsonb not null default '[]'::jsonb;
update public.schedule_rules set breaks=jsonb_build_array(jsonb_build_object('start',to_char(break_start_time,'HH24:MI'),'end',to_char(break_end_time,'HH24:MI')))
where break_start_time is not null and break_end_time is not null;

create function public.studio_flow_validate_breaks(p_blocks jsonb,p_start time,p_end time) returns jsonb
language plpgsql immutable set search_path='' as $$
declare b jsonb; s time; e time; result jsonb := '[]';
begin
 if p_blocks is null or jsonb_typeof(p_blocks)<>'array' then raise exception 'Revisa los bloques de descanso.'; end if;
 for b in select value from jsonb_array_elements(p_blocks) loop
  s:=nullif(b->>'start','')::time; e:=nullif(b->>'end','')::time;
  if s is null or e is null or s>=e or p_start is null or p_end is null or s<p_start or e>p_end then
   raise exception 'Cada descanso debe tener inicio y fin dentro del horario del dia.';
  end if;
  if exists(select 1 from jsonb_array_elements(result) x where (x->>'start')::time<e and (x->>'end')::time>s) then
   raise exception 'Hay descansos que se empalman.';
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('start',to_char(s,'HH24:MI'),'end',to_char(e,'HH24:MI')));
 end loop;
 return result;
end;$$;

do $$
declare d text; old text;
begin
 select pg_get_functiondef('public.studio_flow_artist_save_context_schedule_settings(jsonb,text,uuid)'::regprocedure) into d;
 old:='insert into schedule_rules (schedule_id, weekday, is_active, start_time, end_time, break_start_time, break_end_time)';
 if position(old in d)=0 then raise exception 'Unexpected schedule save definition'; end if;
 d:=replace(d,old,'insert into schedule_rules (schedule_id, weekday, is_active, start_time, end_time, break_start_time, break_end_time, breaks)');
 old:='values (v_schedule.id, v_weekday, true, v_start_time, v_end_time, v_break_start_time, v_break_end_time);';
 if position(old in d)=0 then raise exception 'Unexpected schedule values'; end if;
 d:=replace(d,old,$r$values (v_schedule.id, v_weekday, true, v_start_time, v_end_time, v_break_start_time, v_break_end_time,
 public.studio_flow_validate_breaks(coalesce(v_day->'blocks',case when v_break_start_time is not null then jsonb_build_array(jsonb_build_object('start',v_break_start_time,'end',v_break_end_time)) else '[]'::jsonb end),v_start_time,v_end_time));$r$);
 old:='if (v_rule.break_start_time is null or v_rule.break_end_time is null';
 if position(old in d)=0 then raise exception 'Unexpected generation guard'; end if;
 d:=replace(d,old,$r$if not exists(select 1 from jsonb_array_elements(v_rule.breaks) b
 where v_slot_start_local < v_generation_date + (b->>'end')::time
 and v_slot_end_local > v_generation_date + (b->>'start')::time)
 and (v_rule.break_start_time is null or v_rule.break_end_time is null$r$);
 execute d;
 select pg_get_functiondef('public.studio_flow_artist_schedule_payload_for_context(text,uuid)'::regprocedure) into d;
 old:='''breakStartTime'', sr.break_start_time,';
 if position(old in d)=0 then raise exception 'Unexpected schedule payload'; end if;
 execute replace(d,old,'''blocks'', sr.breaks, '||old);
 select pg_get_functiondef('public.studio_flow_slot_obeys_booking_rules(uuid,timestamptz)'::regprocedure) into d;
 old:='and r.weekday=extract(dow from slot.starts_at at time zone s.timezone)::integer';
 if position(old in d)=0 then raise exception 'Unexpected booking guard'; end if;
 execute replace(d,old,old||$r$
 and not exists(select 1 from jsonb_array_elements(r.breaks) b
 where slot.starts_at at time zone s.timezone < (slot.starts_at at time zone s.timezone)::date + (b->>'end')::time
 and p_end at time zone s.timezone > (slot.starts_at at time zone s.timezone)::date + (b->>'start')::time)$r$);
end;$$;
revoke all on function public.studio_flow_validate_breaks(jsonb,time,time) from public;
grant execute on function public.studio_flow_validate_breaks(jsonb,time,time) to postgres;
commit;
