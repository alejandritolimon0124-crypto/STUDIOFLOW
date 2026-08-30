do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_get_manual_availability(uuid, date)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_artist_get_manual_availability was not found';
  end if;

  v_definition := replace(
    v_definition,
    $old$
    else (
      select membership.studio_id
      from artist_studio_memberships membership
      where membership.artist_id = v_artist.id
        and membership.status = 'active'
        and membership.archived_at is null
      order by membership.created_at desc
      limit 1
    )
$old$,
    $new$
    else null
$new$
  );

  v_definition := replace(
    v_definition,
    $old$
    else (
      select membership.id
      from artist_studio_memberships membership
      where membership.artist_id = v_artist.id
        and (v_studio_id is null or membership.studio_id = v_studio_id)
        and membership.status = 'active'
        and membership.archived_at is null
      order by membership.created_at desc
      limit 1
    )
$old$,
    $new$
    else null
$new$
  );

  v_definition := replace(
    v_definition,
    $old$
      and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)
      and (v_membership_id is null or slot.membership_id is null or slot.membership_id = v_membership_id)
$old$,
    $new$
      and (
        (v_service.owner_type = 'artist' and slot.studio_id is null and slot.membership_id is null)
        or (v_service.owner_type = 'membership' and slot.membership_id = v_membership_id)
        or (v_service.owner_type = 'studio' and slot.studio_id = v_studio_id)
      )
$new$
  );

  execute v_definition;
end;
$$;
