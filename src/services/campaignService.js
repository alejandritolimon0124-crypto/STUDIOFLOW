import { requireSupabase } from "../lib/supabaseClient";

function unwrap(data, error) {
  if (error) throw error;
  return data;
}

export async function listCampaigns(entityType, entityId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_list_for_entity",
    { p_entity_type: entityType, p_entity_id: entityId },
  );
  return unwrap(data || [], error);
}

export async function createCampaign(entityType, entityId, values) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_create_for_entity",
    {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_name: values.name,
      p_event_name: values.eventName,
      p_event_date: values.startsAt ? values.startsAt.slice(0, 10) : null,
      p_starts_at: values.startsAt
        ? new Date(values.startsAt).toISOString()
        : null,
      p_ends_at: values.endsAt ? new Date(values.endsAt).toISOString() : null,
      p_description: values.description || null,
      p_promotion_name: values.promotionName || "Rifa Visitantes",
      p_client_raffle_name: values.clientRaffleName || "Rifa Clientas Expo",
      p_welcome_text: values.welcomeText || null,
      p_image_url: values.imageUrl || null,
      p_slug: values.slug,
      p_folio_prefix: values.folioPrefix || "EXPO",
      p_form_config: {
        questions: values.questions || [],
        eventTypes: (values.eventTypes || [])
          .map((item) => item.trim())
          .filter(Boolean),
      },
      p_channels: values.channels || [],
      p_raffles: (values.raffles || []).map((raffle) => ({
        ...raffle,
        groupType: ["event_type", "hired_event_type", "not_hired"].includes(
          raffle.groupType,
        )
          ? "all"
          : raffle.groupType,
      })),
    },
  );
  const campaign = unwrap(data, error);
  const { error: eventTypesError } = await supabase.rpc(
    "studio_flow_campaign_set_event_types",
    {
      p_campaign_id: campaign.id,
      p_event_types: (values.eventTypes || [])
        .map((item) => item.trim())
        .filter(Boolean),
    },
  );
  if (eventTypesError) throw eventTypesError;
  const { error: raffleFiltersError } = await supabase.rpc(
    "studio_flow_campaign_set_raffle_filters",
    {
      p_campaign_id: campaign.id,
      p_filters: (values.raffles || []).map((raffle, position) => ({
        position,
        groupType: raffle.groupType,
        channelSlug: raffle.channelSlug || "",
        eventType: raffle.eventType || "",
      })),
    },
  );
  if (raffleFiltersError) throw raffleFiltersError;
  return {
    ...campaign,
    form_config: {
      ...(campaign.form_config || {}),
      eventTypes: (values.eventTypes || [])
        .map((item) => item.trim())
        .filter(Boolean),
    },
  };
}

export async function getPublicCampaign(slug) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("studio_flow_campaign_public", {
    p_slug: slug,
  });
  return unwrap(data, error);
}

export async function updateCampaign(campaignId, values) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("studio_flow_campaign_update", {
    p_campaign_id: campaignId,
    p_name: values.name,
    p_event_name: values.eventName,
    p_description: values.description || null,
    p_welcome_text: values.welcomeText || null,
    p_starts_at: new Date(values.startsAt).toISOString(),
    p_ends_at: new Date(values.endsAt).toISOString(),
  });
  return unwrap(data, error);
}

export async function updateCampaignRaffles(campaignId, raffles) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_update_raffles",
    {
      p_campaign_id: campaignId,
      p_raffles: raffles.map((raffle) => ({
        id: raffle.id,
        name: raffle.name,
        groupType: raffle.groupType,
        channelId: raffle.channelId || null,
        eventType: raffle.eventType || null,
        winnerCount: raffle.winnerCount,
        allowRepeat: raffle.allowRepeat,
      })),
    },
  );
  return unwrap(data || [], error);
}

export async function registerCampaignParticipant(slug, values) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("studio_flow_campaign_register", {
    p_slug: slug,
    p_full_name: values.fullName,
    p_whatsapp: values.whatsapp,
    p_email: values.email,
    p_event_type: values.eventType,
    p_approximate_event_date: values.eventDate || null,
    p_interested_service: values.service,
    p_accepts_promotions: values.acceptsPromotions,
    p_answers: values.answers || {},
    p_channel_slug: values.channelSlug || null,
  });
  if (error) throw error;

  const { data: emailResult, error: emailError } =
    await supabase.functions.invoke("send-campaign-confirmation", {
      body: {
        participantId: data.participantId,
        deliveryToken: data.deliveryToken,
      },
    });

  return { ...data, emailSent: !emailError && emailResult?.ok === true };
}

export async function listCampaignParticipants(campaignId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_participants",
    { p_campaign_id: campaignId },
  );
  return unwrap(data || [], error);
}

export async function markCampaignParticipantHired(
  participantId,
  hired = true,
) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_mark_hired",
    {
      p_participant_id: participantId,
      p_hired: hired,
    },
  );
  return unwrap(data, error);
}

export async function drawCampaignWinner(campaignId, raffleType) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_draw_raffle",
    {
      p_campaign_id: campaignId,
      p_raffle_id: raffleType,
    },
  );
  return unwrap(data, error);
}

export async function getCampaignDashboard(campaignId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("studio_flow_campaign_dashboard", {
    p_campaign_id: campaignId,
  });
  return unwrap(data || { channels: [], raffles: [] }, error);
}

export async function deleteCampaign(campaignId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("studio_flow_campaign_delete", {
    p_campaign_id: campaignId,
  });
  return unwrap(data, error);
}

export async function shareCampaignWithClients(campaignId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_share_with_clients",
    {
      p_campaign_id: campaignId,
    },
  );
  return unwrap(data, error);
}

export async function setCampaignStatus(campaignId, status) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(
    "studio_flow_campaign_set_status",
    {
      p_campaign_id: campaignId,
      p_status: status,
    },
  );
  return unwrap(data, error);
}
