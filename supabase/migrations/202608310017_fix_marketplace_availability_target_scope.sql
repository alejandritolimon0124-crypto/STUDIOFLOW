do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_availability(uuid, uuid, date)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_marketplace_get_availability function was not found';
  end if;

  if position('studio_flow_marketplace_availability_exact_target_scope' in v_definition) = 0 then
    v_updated_definition := v_definition;

    v_updated_definition := replace(
      v_updated_definition,
      '      and (
        slot.artist_id = v_artist_id
        or (v_membership_id is not null and slot.membership_id = v_membership_id)
      )
      and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)',
      '      -- studio_flow_marketplace_availability_exact_target_scope
      and (
        (v_membership_id is not null and slot.membership_id = v_membership_id)
        or (
          v_membership_id is null
          and v_studio_id is not null
          and slot.artist_id = v_artist_id
          and slot.studio_id = v_studio_id
        )
        or (
          v_membership_id is null
          and v_studio_id is null
          and slot.artist_id = v_artist_id
          and slot.studio_id is null
          and slot.membership_id is null
        )
      )'
    );

    v_updated_definition := replace(
      v_updated_definition,
      '          and (
            covered.artist_id = v_artist_id
            or (v_membership_id is not null and covered.membership_id = v_membership_id)
          )
          and (v_studio_id is null or covered.studio_id is null or covered.studio_id = v_studio_id)',
      '          and (
            (v_membership_id is not null and covered.membership_id = v_membership_id)
            or (
              v_membership_id is null
              and v_studio_id is not null
              and covered.artist_id = v_artist_id
              and covered.studio_id = v_studio_id
            )
            or (
              v_membership_id is null
              and v_studio_id is null
              and covered.artist_id = v_artist_id
              and covered.studio_id is null
              and covered.membership_id is null
            )
          )'
    );

    if v_updated_definition = v_definition then
      raise exception 'Could not patch marketplace availability target scope';
    end if;

    execute v_updated_definition;
  end if;
end $$;
