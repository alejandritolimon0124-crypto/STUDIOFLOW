import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Shuffle,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useApp } from "../../contexts/appContextCore";
import Button from "../../components/Button";
import Input from "../../components/Input";
import CampaignGiveawayBuilder from "../../components/CampaignGiveawayBuilder";
import {
  createCampaign,
  deleteCampaign,
  drawCampaignWinner,
  getCampaignDashboard,
  listCampaignParticipants,
  listCampaigns,
  markCampaignParticipantHired,
  shareCampaignWithClients,
  setCampaignStatus,
  updateCampaign,
  updateCampaignRaffles,
} from "../../services/campaignService";
import { optimizeImageFile } from "../../utils/imageOptimization";

const blankCampaign = () => ({
  name: "",
  eventName: "",
  startsAt: "",
  endsAt: "",
  description: "",
  welcomeText: "",
  imageUrl: "",
  slug: "",
  folioPrefix: "EXPO",
  eventTypes: ["Boda", "XV años", "Otro"],
  questions: [],
  channels: [],
  raffles: [
    {
      id: crypto.randomUUID(),
      name: "",
      groupType: "all",
      channelSlug: "",
      eventType: "",
      winnerCount: 1,
      allowRepeat: false,
    },
  ],
});
const newQuestion = () => ({
  id: `q_${crypto.randomUUID().replaceAll("-", "")}`,
  label: "",
  type: "single",
  required: false,
  options: ["Opción 1", "Opción 2"],
});
const questionTypeLabel = {
  single: "Opción única",
  multiple: "Opción múltiple",
  short: "Texto breve",
  dichotomous: "Dicotómica",
};
const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const isEligibleForRaffle = (participant, raffle) => {
  if (raffle.group_type === "hired") return participant.hired;
  if (raffle.group_type === "not_hired") return !participant.hired;
  if (raffle.group_type === "hired_event_type")
    return participant.hired && participant.event_type === raffle.event_type;
  if (raffle.group_type === "channel")
    return participant.source_channel_id === raffle.channel_id;
  if (raffle.group_type === "event_type")
    return participant.event_type === raffle.event_type;
  return true;
};
const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
function AdminCampaigns() {
  const { session } = useApp();
  const studioId =
    session.activeSessionContext?.studioId ||
    session.user?.studioId ||
    (session.roles || []).find((role) => role.role === "studio_owner")
      ?.studioId;
  const artistId =
    session.activeSessionContext?.artistId ||
    session.artist?.id ||
    session.user?.artistId ||
    null;
  const entityType = studioId ? "studio" : "artist";
  const entityId = studioId || artistId;
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [draft, setDraft] = useState(blankCampaign);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [hiredFilter, setHiredFilter] = useState("");
  const [winner, setWinner] = useState(null);
  const [drawingType, setDrawingType] = useState("");
  const [drawPreview, setDrawPreview] = useState(null);
  const [drawNotice, setDrawNotice] = useState("");
  const [qrData, setQrData] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [responsesOpen, setResponsesOpen] = useState(false);
  const [responseLimit, setResponseLimit] = useState(10);
  const [campaignDashboard, setCampaignDashboard] = useState({
    channels: [],
    raffles: [],
  });
  const [qrChannel, setQrChannel] = useState("");
  const [imageProcessing, setImageProcessing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [changingVisibility, setChangingVisibility] = useState(false);

  useEffect(() => {
    if (!entityId) return;
    let active = true;
    listCampaigns(entityType, entityId)
      .then((items) => {
        if (!active) return;
        setCampaigns(items);
        setSelected((current) => current || items[0] || null);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [entityId, entityType]);
  const refreshParticipants = async ({ silent = false } = {}) => {
    if (!selected?.id) return;
    if (!silent) setRefreshing(true);
    try {
      const items = await listCampaignParticipants(selected.id);
      setParticipants(items);
      setLastUpdated(new Date());
      setError("");
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!selected?.id) return undefined;
    const initialRefreshId = window.setTimeout(() => {
      setResponsesOpen(false);
      setResponseLimit(10);
      setShareMessage("");
      setQrChannel("");
      refreshParticipants();
      getCampaignDashboard(selected.id)
        .then(setCampaignDashboard)
        .catch((dashboardError) => setError(dashboardError.message));
    }, 0);
    const intervalId = window.setInterval(
      () => refreshParticipants({ silent: true }),
      5000,
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible")
        refreshParticipants({ silent: true });
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
    // selected.id is the polling boundary; the callback intentionally reads the current campaign.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.slug) return;
    const campaignUrl = `${window.location.origin}/campana/${selected.slug}${qrChannel ? `?canal=${encodeURIComponent(qrChannel)}` : ""}`;
    QRCode.toDataURL(campaignUrl, {
      width: 420,
      margin: 2,
      color: { dark: "#39292d", light: "#ffffff" },
    }).then(setQrData);
  }, [selected?.slug, qrChannel]);

  const filtered = useMemo(
    () =>
      participants.filter((item) => {
        const haystack =
          `${item.full_name} ${item.whatsapp} ${item.folio}`.toLowerCase();
        return (
          (!query || haystack.includes(query.toLowerCase())) &&
          (!eventFilter || item.event_type === eventFilter) &&
          (!serviceFilter || item.interested_service === serviceFilter) &&
          (!hiredFilter || String(item.hired) === hiredFilter)
        );
      }),
    [participants, query, eventFilter, serviceFilter, hiredFilter],
  );
  const stats = useMemo(
    () => ({
      total: participants.length,
      weddings: participants.filter((p) => p.event_type === "Boda").length,
      xv: participants.filter((p) => p.event_type === "XV años").length,
      hired: participants.filter((p) => p.hired).length,
    }),
    [participants],
  );

  const selectCampaignImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageProcessing(true);
    setError("");
    try {
      const imageUrl = await optimizeImageFile(file, {
        maxWidth: 1400,
        maxHeight: 1000,
        quality: 0.8,
      });
      setDraft((current) => ({ ...current, imageUrl }));
    } catch (imageError) {
      setError(
        imageError.message || "No fue posible preparar la imagen seleccionada.",
      );
    } finally {
      setImageProcessing(false);
    }
  };

  const submitCampaign = async (event) => {
    event.preventDefault();
    setError("");
    if (!draft.startsAt || !draft.endsAt)
      return setError(
        "Indica la fecha y hora de inicio y término de la campaña.",
      );
    if (new Date(draft.endsAt) <= new Date(draft.startsAt))
      return setError(
        "La fecha y hora de término debe ser posterior al inicio.",
      );
    if (
      !draft.eventTypes.length ||
      draft.eventTypes.some((item) => !item.trim())
    )
      return setError(
        "Agrega al menos un tipo de evento y completa todas las opciones.",
      );
    try {
      const created = await createCampaign(entityType, entityId, {
        ...draft,
        slug: draft.slug || slugify(draft.name),
      });
      setCampaigns((items) => [created, ...items]);
      setSelected(created);
      setCreating(false);
      setDraft(blankCampaign());
    } catch (e) {
      setError(e.message);
    }
  };
  const toggleHired = async (participant) => {
    await markCampaignParticipantHired(participant.id, !participant.hired);
    setParticipants((items) =>
      items.map((item) =>
        item.id === participant.id ? { ...item, hired: !item.hired } : item,
      ),
    );
  };
  const openCampaignEditor = () => {
    setEditDraft({
      name: selected.name || "",
      eventName: selected.event_name || "",
      description: selected.description || "",
      welcomeText: selected.welcome_text || "",
      startsAt: toLocalDateTime(selected.starts_at),
      endsAt: toLocalDateTime(selected.ends_at),
      raffles: campaignDashboard.raffles.map((raffle) => ({
        id: raffle.id,
        name: raffle.name,
        groupType: raffle.group_type,
        channelId: raffle.channel_id || "",
        eventType: raffle.event_type || "",
        winnerCount: raffle.winner_count,
        allowRepeat: raffle.allow_repeat,
        drawCount: raffle.draw_count,
      })),
    });
    setEditing(true);
    setError("");
  };
  const saveCampaignEdit = async (event) => {
    event.preventDefault();
    if (
      !editDraft.startsAt ||
      !editDraft.endsAt ||
      new Date(editDraft.endsAt) <= new Date(editDraft.startsAt)
    ) {
      setError("El término de la campaña debe ser posterior al inicio.");
      return;
    }
    setSavingEdit(true);
    setError("");
    try {
      const updated = await updateCampaign(selected.id, editDraft);
      const updatedRaffles = await updateCampaignRaffles(
        selected.id,
        editDraft.raffles,
      );
      setCampaigns((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelected(updated);
      setCampaignDashboard((current) => ({
        ...current,
        raffles: updatedRaffles,
      }));
      setEditing(false);
    } catch (editError) {
      setError(editError.message || "No fue posible guardar los cambios.");
    } finally {
      setSavingEdit(false);
    }
  };
  const updateQuestion = (index, changes) =>
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...changes } : question,
      ),
    }));
  const addQuestion = () =>
    setDraft((current) =>
      current.questions.length >= 20
        ? current
        : { ...current, questions: [...current.questions, newQuestion()] },
    );
  const removeQuestion = (index) =>
    setDraft((current) => ({
      ...current,
      questions: current.questions.filter(
        (_, questionIndex) => questionIndex !== index,
      ),
    }));
  const moveQuestion = (index, direction) =>
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.questions.length) return current;
      const questions = [...current.questions];
      [questions[index], questions[target]] = [
        questions[target],
        questions[index],
      ];
      return { ...current, questions };
    });
  const updateOption = (questionIndex, optionIndex, value) =>
    updateQuestion(questionIndex, {
      options: draft.questions[questionIndex].options.map((option, index) =>
        index === optionIndex ? value : option,
      ),
    });
  const addOption = (questionIndex) => {
    const question = draft.questions[questionIndex];
    if (question.options.length >= 20) return;
    updateQuestion(questionIndex, {
      options: [...question.options, `Opción ${question.options.length + 1}`],
    });
  };
  const removeOption = (questionIndex, optionIndex) => {
    const question = draft.questions[questionIndex];
    if (question.options.length <= 2) return;
    updateQuestion(questionIndex, {
      options: question.options.filter((_, index) => index !== optionIndex),
    });
  };
  const draw = async (raffle) => {
    const eligible = participants.filter((participant) =>
      isEligibleForRaffle(participant, raffle),
    );
    if (!eligible.length) {
      const emptyMessages = {
        hired:
          "No hay participantes marcadas como contratadas para este sorteo.",
        not_hired:
          "No hay participantes pendientes de contratación para este sorteo.",
        event_type: `No hay participantes registradas para ${raffle.event_type}.`,
        hired_event_type: `No hay participantes de ${raffle.event_type} marcadas como contratadas.`,
        channel: "No hay participantes registradas desde el canal elegido.",
      };
      setDrawNotice(
        emptyMessages[raffle.group_type] ||
          "Aún no hay participantes para este premio.",
      );
      return;
    }
    setError("");
    setDrawingType(raffle.id);
    setDrawPreview(eligible[0]);
    let position = 0;
    const previewInterval = window.setInterval(() => {
      position =
        (position +
          1 +
          Math.floor(Math.random() * Math.max(1, eligible.length))) %
        eligible.length;
      setDrawPreview(eligible[position]);
    }, 85);
    try {
      const [result] = await Promise.all([
        drawCampaignWinner(selected.id, raffle.id),
        new Promise((resolve) => window.setTimeout(resolve, 7000)),
      ]);
      window.clearInterval(previewInterval);
      setDrawPreview(result.participant);
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      setWinner({ ...result, raffleName: raffle.name });
      getCampaignDashboard(selected.id)
        .then(setCampaignDashboard)
        .catch(() => {});
    } catch (drawError) {
      window.clearInterval(previewInterval);
      setDrawNotice(
        drawError.message || "No fue posible realizar el sorteo.",
      );
    } finally {
      setDrawingType("");
      setDrawPreview(null);
    }
  };
  const exportCsv = () => {
    const questions = selected.form_config?.questions || [];
    const rows = [
      [
        "Folio",
        "Nombre",
        "WhatsApp",
        "Correo",
        "Tipo de evento",
        "Fecha del evento",
        "Servicio",
        ...questions.map((question) => question.label),
        "Registro",
        "Promociones",
        "Contrató",
      ],
      ...participants.map((p) => [
        p.folio,
        p.full_name,
        p.whatsapp,
        p.email,
        p.event_type,
        p.approximate_event_date || "",
        p.interested_service,
        ...questions.map((question) =>
          Array.isArray(p.answers?.[question.id])
            ? p.answers[question.id].join(" | ")
            : p.answers?.[question.id] || "",
        ),
        p.created_at,
        p.accepts_promotions ? "Sí" : "No",
        p.hired ? "Sí" : "No",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv" }),
    );
    link.download = `${selected.slug}-participantes.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const removeCampaign = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteCampaign(selected.id);
      const remaining = campaigns.filter(
        (campaign) => campaign.id !== selected.id,
      );
      setCampaigns(remaining);
      setSelected(remaining[0] || null);
      setParticipants([]);
      setConfirmingDelete(false);
    } catch (deleteError) {
      setError(deleteError.message || "No fue posible eliminar la campaña.");
    } finally {
      setDeleting(false);
    }
  };
  const shareCampaign = async () => {
    setSharing(true);
    setShareMessage("");
    setError("");
    try {
      const result = await shareCampaignWithClients(selected.id);
      const sent = Number(result?.insertedCount || 0);
      const total = Number(result?.recipientCount || 0);
      setShareMessage(
        sent
          ? `Campaña compartida con ${sent} clientas.`
          : total
            ? "Esta campaña ya había sido compartida con todas tus clientas."
            : "Aún no hay clientas relacionadas con este perfil para notificar.",
      );
    } catch (shareError) {
      setError(shareError.message || "No fue posible compartir la campaña.");
    } finally {
      setSharing(false);
    }
  };
  const toggleCampaignVisibility = async () => {
    setChangingVisibility(true);
    setError("");
    try {
      const updated = await setCampaignStatus(
        selected.id,
        selected.status === "active" ? "draft" : "active",
      );
      setCampaigns((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelected(updated);
      setShareMessage(
        updated.status === "active"
          ? "La campaña vuelve a estar disponible."
          : "Campaña oculta. El enlace ya no permite verla ni registrarse.",
      );
    } catch (visibilityError) {
      setError(
        visibilityError.message || "No fue posible cambiar la visibilidad.",
      );
    } finally {
      setChangingVisibility(false);
    }
  };

  return (
    <main className="campaign-admin-page">
      <header className="campaign-admin-title">
        <div>
          <span className="campaign-eyebrow">PROSPECTOS Y EVENTOS</span>
          <h1>Campañas</h1>
          <p>Crea registros mediante QR y administra tus rifas.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={18} /> Nueva campaña
        </Button>
      </header>
      {error && <p className="campaign-error">{error}</p>}
      {creating && (
        <form className="campaign-create-panel" onSubmit={submitCampaign}>
          <h2>Nueva campaña</h2>
          <div className="campaign-form-grid">
            <Input
              label="Nombre de la campaña"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
            <Input
              label="Nombre del evento"
              value={draft.eventName}
              onChange={(e) =>
                setDraft({ ...draft, eventName: e.target.value })
              }
              required
            />
            <Input
              label="Inicio de la campaña"
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              required
            />
            <Input
              label="Término de la campaña"
              type="datetime-local"
              min={draft.startsAt || undefined}
              value={draft.endsAt}
              onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              required
            />
            <Input
              label="Prefijo del folio"
              value={draft.folioPrefix}
              onChange={(e) =>
                setDraft({ ...draft, folioPrefix: e.target.value })
              }
              required
            />
            <div className="campaign-image-field">
              <span>Imagen o logo de la campaña</span>
              <div
                className={`campaign-image-picker${draft.imageUrl ? " has-image" : ""}`}
              >
                {draft.imageUrl ? (
                  <img src={draft.imageUrl} alt="Vista previa de la campaña" />
                ) : (
                  <ImagePlus size={32} aria-hidden="true" />
                )}
                <label htmlFor="campaign-image-input">
                  <ImagePlus size={17} aria-hidden="true" />{" "}
                  {imageProcessing
                    ? "Preparando imagen..."
                    : draft.imageUrl
                      ? "Cambiar imagen"
                      : "Elegir de mi galería"}
                </label>
                <input
                  id="campaign-image-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageProcessing}
                  onChange={selectCampaignImage}
                />
                {draft.imageUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({ ...current, imageUrl: "" }))
                    }
                  >
                    Quitar
                  </button>
                )}
              </div>
              <small>
                JPG, PNG o WebP. La imagen se optimiza automáticamente.
              </small>
            </div>
            <label className="input-field">
              <span>Descripción</span>
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label className="input-field campaign-wide">
              <span>Texto de bienvenida</span>
              <textarea
                value={draft.welcomeText}
                onChange={(e) =>
                  setDraft({ ...draft, welcomeText: e.target.value })
                }
              />
            </label>
          </div>
          <CampaignGiveawayBuilder draft={draft} setDraft={setDraft} />
          <section className="campaign-form-builder campaign-event-types-builder">
            <div className="campaign-builder-heading">
              <div>
                <span className="campaign-eyebrow">FORMULARIO DE REGISTRO</span>
                <h3>Tipos de evento</h3>
                <p>
                  Estas opciones aparecerán en el formulario de las
                  participantes.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={draft.eventTypes.length >= 12}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    eventTypes: [...current.eventTypes, ""],
                  }))
                }
              >
                <Plus size={17} /> Agregar tipo
              </Button>
            </div>
            <div className="campaign-event-type-options">
              {draft.eventTypes.map((eventType, index) => (
                <div key={`event-type-${index}`}>
                  <Input
                    label={`Opción ${index + 1}`}
                    placeholder="Graduación, cumpleaños, inauguración..."
                    maxLength={80}
                    value={eventType}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        eventTypes: current.eventTypes.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      }))
                    }
                    required
                  />
                  <button
                    type="button"
                    aria-label={`Eliminar ${eventType || `opción ${index + 1}`}`}
                    disabled={draft.eventTypes.length <= 1}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        eventTypes: current.eventTypes.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="campaign-form-builder">
            <div className="campaign-builder-heading">
              <div>
                <span className="campaign-eyebrow">
                  FORMULARIO PERSONALIZADO
                </span>
                <h3>Preguntas adicionales</h3>
                <p>
                  Nombre, celular y correo siempre se solicitan automáticamente.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={draft.questions.length >= 20}
                onClick={addQuestion}
              >
                <Plus size={17} /> Agregar pregunta
              </Button>
            </div>
            {draft.questions.map((question, index) => (
              <article className="campaign-question-editor" key={question.id}>
                <div className="campaign-question-order">
                  <strong>{index + 1}</strong>
                  <button
                    type="button"
                    aria-label="Subir pregunta"
                    disabled={!index}
                    onClick={() => moveQuestion(index, -1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label="Bajar pregunta"
                    disabled={index === draft.questions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar pregunta"
                    onClick={() => removeQuestion(index)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="campaign-question-fields">
                  <Input
                    label="Pregunta"
                    value={question.label}
                    maxLength={160}
                    onChange={(e) =>
                      updateQuestion(index, { label: e.target.value })
                    }
                    required
                  />
                  <label className="input-field">
                    <span>Tipo de respuesta</span>
                    <select
                      value={question.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        updateQuestion(index, {
                          type,
                          options:
                            type === "dichotomous"
                              ? ["Sí", "No"]
                              : type === "short"
                                ? []
                                : question.options.length >= 2
                                  ? question.options
                                  : ["Opción 1", "Opción 2"],
                        });
                      }}
                    >
                      {Object.entries(questionTypeLabel).map(
                        ([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="campaign-required-toggle">
                    <input
                      type="checkbox"
                      checked={question.required}
                      onChange={(e) =>
                        updateQuestion(index, { required: e.target.checked })
                      }
                    />
                    <span>Respuesta obligatoria</span>
                  </label>
                  {question.type !== "short" && (
                    <div className="campaign-option-editor">
                      <span>Respuestas posibles</span>
                      {question.options.map((option, optionIndex) => (
                        <div key={`${question.id}-${optionIndex}`}>
                          <input
                            required
                            maxLength={100}
                            value={option}
                            onChange={(e) =>
                              updateOption(index, optionIndex, e.target.value)
                            }
                          />
                          <button
                            type="button"
                            aria-label="Eliminar opción"
                            disabled={
                              question.options.length <= 2 ||
                              question.type === "dichotomous"
                            }
                            onClick={() => removeOption(index, optionIndex)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      {question.type !== "dichotomous" && (
                        <button
                          type="button"
                          onClick={() => addOption(index)}
                          disabled={question.options.length >= 20}
                        >
                          <Plus size={16} /> Agregar respuesta
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
            {!draft.questions.length && (
              <div className="campaign-builder-empty">
                Agrega preguntas para conocer los intereses de las
                participantes.
              </div>
            )}
          </section>
          <div className="campaign-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={imageProcessing}>
              Crear campaña
            </Button>
          </div>
        </form>
      )}
      <div className="campaign-admin-layout">
        <aside className="campaign-list">
          <h2>Mis campañas</h2>
          {campaigns.map((item) => (
            <button
              className={selected?.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSelected(item)}
            >
              <strong>{item.name}</strong>
              <small>{item.event_name}</small>
            </button>
          ))}
          {!campaigns.length && <p>Aún no hay campañas.</p>}
        </aside>
        {selected && (
          <section className="campaign-detail">
            <div className="campaign-detail-head">
              <div>
                <span className="campaign-eyebrow">{selected.event_name}</span>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
                <div className="campaign-detail-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={openCampaignEditor}
                  >
                    <Pencil size={17} /> Editar campaña
                  </Button>
                  <Button
                    type="button"
                    disabled={sharing || selected.status !== "active"}
                    onClick={shareCampaign}
                  >
                    <BellRing size={17} />{" "}
                    {sharing ? "Compartiendo..." : "Compartir con mis clientas"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={changingVisibility}
                    onClick={toggleCampaignVisibility}
                  >
                    {selected.status === "active" ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                    {changingVisibility
                      ? "Actualizando..."
                      : selected.status === "active"
                        ? "Ocultar campaña"
                        : "Volver a publicar"}
                  </Button>
                  <button
                    type="button"
                    className="campaign-delete-trigger"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 size={17} /> Eliminar campaña
                  </button>
                </div>
                {shareMessage && (
                  <p className="campaign-share-message" role="status">
                    {shareMessage}
                  </p>
                )}
              </div>
              <div className="campaign-qr">
                <QrCode size={22} />
                <label>
                  <span>Enlace y QR para</span>
                  <select
                    value={qrChannel}
                    onChange={(event) => setQrChannel(event.target.value)}
                  >
                    <option value="">Enlace general</option>
                    {campaignDashboard.channels.map((channel) => (
                      <option value={channel.slug} key={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </label>
                {qrData && <img src={qrData} alt={`QR de ${selected.name}`} />}
                <a
                  href={`/campana/${selected.slug}${qrChannel ? `?canal=${encodeURIComponent(qrChannel)}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir página pública
                </a>
                <a
                  href={qrData}
                  download={`${selected.slug}${qrChannel ? `-${qrChannel}` : ""}-qr.png`}
                >
                  Descargar QR
                </a>
              </div>
            </div>
            {editing && editDraft && (
              <form className="campaign-edit-panel" onSubmit={saveCampaignEdit}>
                <div className="campaign-builder-heading">
                  <div>
                    <span className="campaign-eyebrow">
                      CORREGIR INFORMACIÓN
                    </span>
                    <h3>Editar campaña</h3>
                  </div>
                </div>
                <div className="campaign-form-grid">
                  <Input
                    label="Nombre de la campaña"
                    value={editDraft.name}
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, name: event.target.value })
                    }
                    required
                  />
                  <Input
                    label="Nombre del evento"
                    value={editDraft.eventName}
                    onChange={(event) =>
                      setEditDraft({
                        ...editDraft,
                        eventName: event.target.value,
                      })
                    }
                    required
                  />
                  <Input
                    label="Inicio"
                    type="datetime-local"
                    value={editDraft.startsAt}
                    onChange={(event) =>
                      setEditDraft({
                        ...editDraft,
                        startsAt: event.target.value,
                      })
                    }
                    required
                  />
                  <Input
                    label="Término"
                    type="datetime-local"
                    min={editDraft.startsAt || undefined}
                    value={editDraft.endsAt}
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, endsAt: event.target.value })
                    }
                    required
                  />
                  <label className="input-field">
                    <span>Descripción</span>
                    <textarea
                      value={editDraft.description}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="input-field">
                    <span>Texto de bienvenida</span>
                    <textarea
                      value={editDraft.welcomeText}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          welcomeText: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="campaign-edit-prizes">
                  <h4>Premios y tómbolas</h4>
                  {editDraft.raffles.map((raffle, index) => (
                    <article key={raffle.id}>
                      <strong>
                        {index === 0
                          ? "Premio principal"
                          : `${index + 1}.° premio`}
                      </strong>
                      <Input
                        label="Nombre del premio"
                        value={raffle.name}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            raffles: current.raffles.map((item) =>
                              item.id === raffle.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          }))
                        }
                        required
                      />
                      <label className="input-field">
                        <span>Grupo participante</span>
                        <select
                          value={raffle.groupType}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              raffles: current.raffles.map((item) =>
                                item.id === raffle.id
                                  ? {
                                      ...item,
                                      groupType: event.target.value,
                                      channelId:
                                        event.target.value === "channel"
                                          ? item.channelId
                                          : "",
                                      eventType: [
                                        "event_type",
                                        "hired_event_type",
                                      ].includes(event.target.value)
                                        ? item.eventType
                                        : "",
                                    }
                                  : item,
                              ),
                            }))
                          }
                        >
                          <option value="all">Todas las participantes</option>
                          <option value="channel">Un canal específico</option>
                          <option value="event_type">Un tipo de evento</option>
                          <option value="hired">
                            Solo quienes contrataron
                          </option>
                          <option value="hired_event_type">
                            Contrataron + tipo de evento
                          </option>
                          <option value="not_hired">
                            Registradas que no contrataron
                          </option>
                        </select>
                      </label>
                      {raffle.groupType === "channel" && (
                        <label className="input-field">
                          <span>Canal</span>
                          <select
                            required
                            value={raffle.channelId}
                            onChange={(event) =>
                              setEditDraft((current) => ({
                                ...current,
                                raffles: current.raffles.map((item) =>
                                  item.id === raffle.id
                                    ? { ...item, channelId: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                          >
                            <option value="">Selecciona un canal</option>
                            {campaignDashboard.channels.map((channel) => (
                              <option value={channel.id} key={channel.id}>
                                {channel.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {["event_type", "hired_event_type"].includes(
                        raffle.groupType,
                      ) && (
                        <label className="input-field">
                          <span>Tipo de evento</span>
                          <select
                            required
                            value={raffle.eventType}
                            onChange={(event) =>
                              setEditDraft((current) => ({
                                ...current,
                                raffles: current.raffles.map((item) =>
                                  item.id === raffle.id
                                    ? { ...item, eventType: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                          >
                            <option value="">Selecciona un tipo</option>
                            {(
                              selected.form_config?.eventTypes || [
                                "Boda",
                                "XV años",
                                "Otro",
                              ]
                            ).map((eventType) => (
                              <option value={eventType} key={eventType}>
                                {eventType}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <Input
                        label="Número de ganadoras"
                        type="number"
                        min={Math.max(1, raffle.drawCount)}
                        max="20"
                        value={raffle.winnerCount}
                        onChange={(event) =>
                          setEditDraft((current) => ({
                            ...current,
                            raffles: current.raffles.map((item) =>
                              item.id === raffle.id
                                ? {
                                    ...item,
                                    winnerCount: Math.max(
                                      item.drawCount,
                                      Number(event.target.value) || 1,
                                    ),
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                      <label className="campaign-required-toggle">
                        <input
                          type="checkbox"
                          checked={raffle.allowRepeat}
                          onChange={(event) =>
                            setEditDraft((current) => ({
                              ...current,
                              raffles: current.raffles.map((item) =>
                                item.id === raffle.id
                                  ? {
                                      ...item,
                                      allowRepeat: event.target.checked,
                                    }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <span>Permitir ganar otros premios</span>
                      </label>
                    </article>
                  ))}
                </div>
                <div className="campaign-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditing(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={savingEdit}>
                    {savingEdit ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </div>
              </form>
            )}
            <div className="campaign-stats">
              <div>
                <strong>{stats.total}</strong>
                <span>Registros</span>
              </div>
              <div>
                <strong>{stats.weddings}</strong>
                <span>Bodas</span>
              </div>
              <div>
                <strong>{stats.xv}</strong>
                <span>XV años</span>
              </div>
              <div>
                <strong>{stats.hired}</strong>
                <span>Contrataron</span>
              </div>
            </div>
            <section className="campaign-raffles">
              {campaignDashboard.raffles.map((raffle) => {
                const eligibleCount = participants.filter((participant) =>
                  isEligibleForRaffle(participant, raffle),
                ).length;
                return (
                  <div key={raffle.id}>
                    <Trophy />
                    <h3>{raffle.name}</h3>
                    <small>{raffle.group_label}</small>
                    <strong>
                      {eligibleCount} participantes · {raffle.draw_count}/
                      {raffle.winner_count} ganadoras
                    </strong>
                    <Button
                      disabled={
                        Boolean(drawingType) ||
                        raffle.draw_count >= raffle.winner_count
                      }
                      onClick={() => draw(raffle)}
                    >
                      {raffle.draw_count >= raffle.winner_count
                        ? "Sorteo completado"
                        : "Realizar sorteo"}
                    </Button>
                  </div>
                );
              })}
            </section>
            <div className="campaign-live-status">
              <span>
                <i aria-hidden="true" /> Actualización automática activa
              </span>
              <small>
                {lastUpdated
                  ? `Actualizado ${lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Consultando registros..."}
              </small>
              <Button
                variant="secondary"
                onClick={() => refreshParticipants()}
                disabled={refreshing}
              >
                <RefreshCw
                  size={18}
                  className={refreshing ? "is-spinning" : ""}
                />{" "}
                {refreshing ? "Actualizando" : "Actualizar ahora"}
              </Button>
            </div>
            <div className="campaign-participant-tools">
              <label>
                <Search size={18} />
                <input
                  placeholder="Buscar nombre, teléfono o folio"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
              >
                <option value="">Todos los eventos</option>
                {(selected.form_config?.eventTypes?.length
                  ? selected.form_config.eventTypes
                  : ["Boda", "XV años", "Otro"]
                ).map((eventType) => (
                  <option value={eventType} key={eventType}>
                    {eventType}
                  </option>
                ))}
              </select>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              >
                <option value="">Todos los servicios</option>
                <option>Paquete de novia</option>
                <option>Paquete XV años</option>
                <option>Maquillaje</option>
                <option>Uñas</option>
                <option>Pestañas</option>
                <option>Otro</option>
              </select>
              <select
                value={hiredFilter}
                onChange={(e) => setHiredFilter(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="true">Contrataron</option>
                <option value="false">No contrataron</option>
              </select>
              <Button variant="secondary" onClick={exportCsv}>
                <Download size={18} /> Descargar
              </Button>
            </div>
            {Boolean((selected.form_config?.questions || []).length) && (
              <section className="campaign-response-results">
                <button
                  type="button"
                  onClick={() => {
                    setResponsesOpen((open) => !open);
                    setResponseLimit(10);
                  }}
                >
                  {responsesOpen
                    ? "Ocultar respuestas del formulario"
                    : `Ver respuestas del formulario (${participants.length})`}
                </button>
                {responsesOpen && (
                  <div>
                    {participants.slice(0, responseLimit).map((participant) => (
                      <article key={participant.id}>
                        <header>
                          <strong>{participant.folio}</strong>
                          <span>{participant.full_name}</span>
                        </header>
                        {selected.form_config.questions.map((question) => (
                          <p key={question.id}>
                            <strong>{question.label}</strong>
                            <span>
                              {Array.isArray(participant.answers?.[question.id])
                                ? participant.answers[question.id].join(", ")
                                : participant.answers?.[question.id] ||
                                  "Sin respuesta"}
                            </span>
                          </p>
                        ))}
                      </article>
                    ))}
                    {responseLimit < participants.length && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setResponseLimit((limit) => limit + 10)}
                      >
                        Mostrar 10 más
                      </Button>
                    )}
                  </div>
                )}
              </section>
            )}
            <div className="campaign-participants">
              <h3>Participantes</h3>
              {filtered.map((p) => (
                <article key={p.id}>
                  <div>
                    <span>{p.folio}</span>
                    <strong>{p.full_name}</strong>
                    <small>
                      {p.whatsapp} · {p.email}
                    </small>
                    {Boolean(
                      (selected.form_config?.questions || []).length,
                    ) && (
                      <details className="campaign-participant-answers">
                        <summary>Ver respuestas</summary>
                        {selected.form_config.questions.map((question) => (
                          <p key={question.id}>
                            <strong>{question.label}</strong>
                            <span>
                              {Array.isArray(p.answers?.[question.id])
                                ? p.answers[question.id].join(", ")
                                : p.answers?.[question.id] || "Sin respuesta"}
                            </span>
                          </p>
                        ))}
                      </details>
                    )}
                  </div>
                  <div>
                    <strong>{p.event_type}</strong>
                    <small>{p.interested_service}</small>
                  </div>
                  <button
                    className={p.hired ? "hired" : ""}
                    onClick={() => toggleHired(p)}
                  >
                    {p.hired ? "Contrató · cambiar" : "Marcar como contrató"}
                  </button>
                </article>
              ))}
              {!filtered.length && (
                <p>No hay participantes con estos filtros.</p>
              )}
            </div>
          </section>
        )}
      </div>
      {drawingType && drawPreview && (
        <div className="campaign-draw-overlay" role="status" aria-live="polite">
          <div>
            <Shuffle size={54} />
            <span>SORTEANDO</span>
            <strong>{drawPreview.folio}</strong>
            <p>{drawPreview.full_name}</p>
            <div className="campaign-draw-track" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      )}
      {drawNotice && (
        <div className="campaign-draw-notice" role="dialog" aria-modal="true">
          <div>
            <Trophy size={46} />
            <span>SORTEO PENDIENTE</span>
            <h2>No hay candidatas disponibles</h2>
            <p>{drawNotice}</p>
            <Button onClick={() => setDrawNotice("")}>Entendido</Button>
          </div>
        </div>
      )}
      {winner && (
        <div className="campaign-winner-overlay" role="dialog">
          <div>
            <Trophy size={72} />
            <span>¡GANADORA!</span>
            <h2>{winner.participant.full_name}</h2>
            <strong>{winner.participant.folio}</strong>
            <p>{winner.raffleName}</p>
            {winner.alreadyDrawn && (
              <small>
                Este sorteo ya se había realizado. Se muestra la ganadora
                guardada.
              </small>
            )}
            <Button onClick={() => setWinner(null)}>Cerrar</Button>
          </div>
        </div>
      )}
      {confirmingDelete && selected && (
        <div
          className="campaign-delete-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-campaign-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting)
              setConfirmingDelete(false);
          }}
        >
          <div>
            <button
              className="campaign-delete-close"
              type="button"
              aria-label="Cerrar"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              <X size={20} />
            </button>
            <Trash2 size={42} />
            <h2 id="delete-campaign-title">Eliminar campaña</h2>
            <p>
              Se eliminará <strong>{selected.name}</strong>, su página pública,
              sus {participants.length} registros y los resultados de sus
              sorteos.
            </p>
            <small>
              Esta acción no afecta clientas, citas ni tu perfil, pero no se
              puede deshacer.
            </small>
            <div>
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancelar
              </Button>
              <button
                type="button"
                className="campaign-delete-confirm"
                disabled={deleting}
                onClick={removeCampaign}
              >
                {deleting ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default AdminCampaigns;
