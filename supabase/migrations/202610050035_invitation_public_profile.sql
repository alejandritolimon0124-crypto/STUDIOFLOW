do $$
declare d text;
begin
  select pg_get_functiondef('public.studio_flow_get_invitation_card(text)'::regprocedure) into d;
  if position('return v_card;' in d) = 0 or position('''listingId''' in d) = 0 then
    raise exception 'Review invitation card response before adding published profile details';
  end if;
  d := replace(d, 'return v_card;', $addition$
  v_card := v_card || jsonb_build_object('publicProfile',
    case when v_row.studio_id is not null then
      (select jsonb_build_object(
        'photoUrl',sp.logo_path,
        'portfolioPaths',coalesce(to_jsonb(sp.gallery_paths),'[]'::jsonb),
        'contactLinks',jsonb_build_object('whatsapp',coalesce(nullif(sp.whatsapp,''),sp.phone),
          'instagram',sp.instagram,'facebook',sp.facebook,'tiktok',sp.tiktok),
        'professionalLocation',jsonb_build_object('addressLine',sp.address_line,'city',sp.city))
      from public.studio_profiles sp where sp.studio_id=v_row.studio_id)
    else
      (select jsonb_build_object(
        'photoUrl',ap.photo_path,
        'portfolioPaths',coalesce(to_jsonb(ap.portfolio_paths),'[]'::jsonb),
        'contactLinks',jsonb_build_object('whatsapp',ap.whatsapp,
          'instagram',ap.instagram,'facebook',ap.facebook,'tiktok',ap.tiktok),
        'professionalLocation',jsonb_build_object('addressLine',ap.address_line,
          'city',ap.city,'state',ap.state))
      from public.artist_profiles ap where ap.artist_id=v_row.artist_id)
    end);
  return v_card;
$addition$);
  execute d;
end $$;
