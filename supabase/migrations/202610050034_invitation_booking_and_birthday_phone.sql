do $$
declare d text;
begin
  select pg_get_functiondef('public.studio_flow_birthday_message(uuid,text,boolean)'::regprocedure) into d;
  if position('''businessName'',coalesce(v_name,''Studio Flow'')' in d) = 0 then
    raise exception 'Review birthday message response before adding WhatsApp';
  end if;
  d := replace(d,
    '''businessName'',coalesce(v_name,''Studio Flow'')',
    '''businessName'',coalesce(v_name,''Studio Flow''),''phone'',
      case when p_studio_id is not null then
        (select coalesce(nullif(trim(sp.whatsapp),''''),nullif(trim(sp.phone),''''))
          from public.studio_profiles sp where sp.studio_id=p_studio_id)
      else (select coalesce(nullif(trim(ap.whatsapp),''''),nullif(trim(p.phone),''''))
          from public.artists a left join public.artist_profiles ap on ap.artist_id=a.id
          left join public.profiles p on p.id=a.profile_id where a.id=v_artist_id)
      end');
  execute d;

  select pg_get_functiondef('public.studio_flow_get_birthday_card(uuid)'::regprocedure) into d;
  if position('coalesce(sp.commercial_name,s.name),sp.phone' in d) = 0
    or position('coalesce(ap.artistic_name,a.display_name),p.phone' in d) = 0 then
    raise exception 'Review birthday contact lookup before using WhatsApp';
  end if;
  d := replace(d,'coalesce(sp.commercial_name,s.name),sp.phone',
    'coalesce(sp.commercial_name,s.name),coalesce(nullif(trim(sp.whatsapp),''''),nullif(trim(sp.phone),''''))');
  d := replace(d,'coalesce(ap.artistic_name,a.display_name),p.phone',
    'coalesce(ap.artistic_name,a.display_name),coalesce(nullif(trim(ap.whatsapp),''''),nullif(trim(p.phone),''''))');
  execute d;

  select pg_get_functiondef('public.studio_flow_get_invitation_card(text)'::regprocedure) into d;
  if position('''discountServiceId'',v_row.discount_service_id' in d) = 0 then
    raise exception 'Review invitation card response before adding its booking listing';
  end if;
  d := replace(d,
    '''discountServiceId'',v_row.discount_service_id',
    '''discountServiceId'',v_row.discount_service_id,''listingId'',
      (select ml.id from public.marketplace_listings ml
        join public.marketplace_profiles mp on mp.id=ml.marketplace_profile_id
        where mp.visibility_status=''visible'' and ml.visibility_status=''visible''
          and (ml.expires_at is null or ml.expires_at>now())
          and ((v_row.studio_id is not null and mp.profile_type=''studio''
            and mp.studio_id=v_row.studio_id)
            or (v_row.artist_id is not null and mp.profile_type=''artist''
              and mp.artist_id=v_row.artist_id and mp.membership_id is null))
        order by ml.generated_at desc nulls last limit 1)');
  execute d;
end $$;
