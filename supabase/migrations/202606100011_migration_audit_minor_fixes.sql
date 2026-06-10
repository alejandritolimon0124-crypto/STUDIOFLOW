create index appointments_marketplace_listing_id_idx on appointments (marketplace_listing_id);

create index appointments_promotion_id_idx on appointments (promotion_id);

alter table audit_events
  add constraint audit_events_entity_type_check
  check (
    entity_type in (
      'profile',
      'role',
      'permission',
      'role_permission',
      'user_role_assignment',
      'studio',
      'studio_profile',
      'governance_review',
      'artist',
      'artist_profile',
      'artist_studio_membership',
      'service_category',
      'service_tier',
      'service_offering',
      'schedule',
      'schedule_rule',
      'calendar_block',
      'availability_slot',
      'appointment',
      'appointment_status_event',
      'client',
      'client_profile',
      'customer_relationship',
      'customer_private_note',
      'favorite_artist',
      'marketplace_profile',
      'marketplace_listing',
      'appointment_economy',
      'commission',
      'loyalty_account',
      'flow_point_ledger_entry',
      'reward',
      'reward_redemption',
      'promotion',
      'risk_flag',
      'sanction',
      'no_show_case',
      'audit_event'
    )
  );

