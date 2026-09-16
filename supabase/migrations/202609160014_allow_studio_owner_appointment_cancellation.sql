do $$
declare
  definition text;
  target text := E'    or exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id where u.profile_id=auth.uid() and u.status=''active'' and u.studio_id=a.studio_id and r.code in (''studio_owner'',''studio_manager''))';
  replacement text := target || E'\n    or exists(\n      select 1\n      from artist_studio_memberships membership\n      join user_role_assignments assignment on assignment.studio_id = membership.studio_id\n      join roles role on role.id = assignment.role_id\n      where membership.id = a.membership_id\n        and membership.status = ''active''\n        and membership.archived_at is null\n        and assignment.profile_id = auth.uid()\n        and assignment.status = ''active''\n        and role.code in (''studio_owner'', ''studio_manager'')\n    )';
begin
  select pg_get_functiondef(
    'public.studio_flow_artist_cancel_appointment(uuid)'::regprocedure
  ) into definition;

  if position('membership.id = a.membership_id' in definition) = 0 then
    if position(target in definition) = 0 then
      raise exception 'Appointment cancellation authorization point was not found';
    end if;
    definition := replace(definition, target, replacement);
    execute definition;
  end if;
end;
$$;
