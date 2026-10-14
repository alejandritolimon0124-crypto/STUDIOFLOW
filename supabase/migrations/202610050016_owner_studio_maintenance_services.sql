-- An artist who also owns a studio can configure reminders for that studio's services.
do $$
declare v_sql text;
begin
  select pg_get_functiondef('public.studio_flow_marketing_reminder_settings(uuid,jsonb)'::regprocedure)
    into v_sql;
  if position('left join artist_studio_memberships m on m.id=so.membership_id' in v_sql)=0
    or position('m.status=''active'' and m.archived_at is null))' in v_sql)=0 then
    raise exception 'Marketing settings changed; review studio service ownership';
  end if;
  v_sql := replace(v_sql,
    'left join artist_studio_memberships m on m.id=so.membership_id',
    'left join artist_studio_memberships m on m.id=so.membership_id
     left join studios s on s.id=so.studio_id');
  v_sql := replace(v_sql,
    'm.status=''active'' and m.archived_at is null))',
    'm.status=''active'' and m.archived_at is null)
              or (so.owner_type=''studio'' and s.owner_profile_id=v_artist.profile_id
                and s.archived_at is null))');
  execute v_sql;
end $$;
