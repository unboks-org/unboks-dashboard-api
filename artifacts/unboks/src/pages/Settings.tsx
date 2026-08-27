import { useEffect, useMemo, useRef, useState, ChangeEvent } from "react";
import { useLocation, useSearch } from "wouter";
import {
  Archive,
  Ban,
  Bell,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { Switch } from "@/components/ui/switch";
import { useEmailSettings } from "@/hooks/use-email-settings";
import {
  useEscalationNotificationPrefs,
  type NotifyChannelKey,
  type DeliveryStatus,
} from "@/hooks/use-escalation-notification-preferences";
import { ApiError } from "@/lib/error";
import { useAccountSettings, type AccountSettings } from "@/hooks/use-account-settings";
import { useAgentNameSettings } from "@/hooks/use-agent-name-settings";
import {
  useResponseTimingSettings,
  useSaveResponseTimingSettings,
} from "@/hooks/use-response-timing-settings";
import {
  useSaveWorkspaceLabels,
  useWorkspaceLabels,
  workspaceLabelsFallback,
} from "@/hooks/use-bookings-label";
import { useYourInfoUpdates, UPDATE_TYPES, type YourInfoUpdate, type YourInfoUpdateType } from "@/hooks/use-your-info-updates";
import { KnowledgeFileUploader } from "@/components/settings/KnowledgeFileUploader";
import { KnowledgeMediaAttachments } from "@/components/settings/KnowledgeMediaAttachments";
import { CloudKnowledgeConnections } from "@/components/settings/CloudKnowledgeConnections";
import { DataRetentionSettings } from "@/components/settings/DataRetentionSettings";
import { AliDossierRetentionSettings } from "@/components/settings/rental/AliDossierSettings";
import { BlockedSendersList } from "@/components/settings/BlockedSendersList";
import { AutoBlockRulesSettings } from "@/components/settings/AutoBlockRulesSettings";
import { ExcludedContactsSettings } from "@/components/settings/ExcludedContactsSettings";
import { AgentLearningsList } from "@/components/settings/AgentLearningsList";
import { AgentPersonalityWizard } from "@/components/settings/AgentPersonalityWizard";
import { useSot, type SotBlock, type SotSubsection } from "@/data/sot";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getTenantUiConfig,
  isAliRentalTenant,
  isSpainSpanishTenant,
  tenantText,
} from "@/lib/tenant-ui";

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
// Lightweight email shape check for the optional alternative email field.
// Matches the same shape used elsewhere (EmailForwardModal) so behaviour
// is consistent across the app.
const ALT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_LINKS_BLOCK_ID = "website-links";
const ALERT_CHANNEL_SUPPORT: Record<NotifyChannelKey, "available" | "coming_soon"> = {
  whatsapp: "available",
  messenger: "coming_soon",
  telegram: "coming_soon",
};
const AGENT_NAME_URL_RE = /https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}/i;
const AGENT_NAME_EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/u;
const AGENT_NAME_BLOCKED_TERMS = [
  "claude",
  "anthropic",
  "openai",
  "chatgpt",
  "human support",
  "doctor",
  "dr.",
  "dr ",
  "lawyer",
  "attorney",
  "therapist",
  "psychologist",
  "official support",
  "official meta support",
  "meta support",
];

function agentNameDraftError(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return tenantText("Enter a name.", "Introduce un nombre.");
  if (name.length > 40) {
    return tenantText("Use 40 characters or fewer.", "Usa 40 caracteres o menos.");
  }
  if (AGENT_NAME_URL_RE.test(name)) {
    return tenantText("Do not use a URL.", "No uses una URL.");
  }
  if (AGENT_NAME_EMOJI_RE.test(name)) {
    return tenantText("Do not use emojis.", "No uses emojis.");
  }
  const lowered = name.toLowerCase();
  if (AGENT_NAME_BLOCKED_TERMS.some((term) => lowered.includes(term))) {
    return tenantText(
      "Choose a name that does not imply a provider, human role, or professional license.",
      "Elige un nombre que no sugiera un proveedor, una identidad humana ni una licencia profesional.",
    );
  }
  return null;
}

type CategoryId =
  | "workspace"
  | "your-info"
  | "agent-personality"
  | "agent-learnings"
  | "escalation"
  | "data-retention"
  | "excluded-contacts"
  | "auto-block"
  | "blocked-senders"
  | "preferences";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  description: string;
  icon: typeof Building2;
}[] = [
  {
    id: "workspace",
    label: "Workspace",
    description: "Manage the basic details shown in your Unboks workspace.",
    icon: Building2,
  },
  {
    id: "your-info",
    label: "Company knowledge",
    description:
      "Add business information, files, policies, offers, and cloud folders your Agent can use when answering customers.",
    icon: Sparkles,
  },
  {
    id: "agent-personality",
    label: "Agent Personality",
    description:
      "Tune your AI Agent's tone, appointment style, and example replies.",
    icon: Sparkles,
  },
  {
    id: "agent-learnings",
    label: "Agent learnings",
    description:
      "Review answers your team gave during escalations. Approved entries become part of your Agent's knowledge.",
    icon: Sparkles,
  },
  {
    id: "escalation",
    label: "Alerts",
    description: "Choose where notifications should be sent.",
    icon: Bell,
  },
  {
    id: "data-retention",
    label: "Data retention & archive",
    description: "Control how long conversations stay active, archived, and searchable.",
    icon: Archive,
  },
  {
    id: "excluded-contacts",
    label: "Excluded Contacts",
    description: "Contacts Unboks should fully ignore before replies, escalations, or alerts.",
    icon: Ban,
  },
  {
    id: "blocked-senders",
    label: "Blocked senders",
    description: "Senders blocked from your active inbox at the Unboks dashboard layer.",
    icon: Ban,
  },
  {
    id: "auto-block",
    label: "Auto-block",
    description: "Automatically block severe abuse and repeated profanity with human review.",
    icon: Ban,
  },
  {
    id: "preferences",
    label: "Labels & Preferences",
    description: "Customize how your dashboard looks and opens replies.",
    icon: SlidersHorizontal,
  },
];

const SPANISH_CATEGORIES: Record<CategoryId, { label: string; description: string }> = {
  workspace: {
    label: "Espacio de trabajo",
    description: "Gestiona los datos básicos que se muestran en tu espacio de trabajo de Unboks.",
  },
  "your-info": {
    label: "Conocimiento de la empresa",
    description:
      "Añade información, archivos, políticas, servicios y carpetas en la nube que el agente puede usar al responder a personas interesadas.",
  },
  "agent-personality": {
    label: "Personalidad del agente",
    description: "Ajusta el tono del agente, su estilo de respuesta y los tiempos de respuesta.",
  },
  "agent-learnings": {
    label: "Aprendizajes del agente",
    description:
      "Revisa las respuestas del equipo. Las entradas aprobadas pasan a formar parte del conocimiento del agente.",
  },
  escalation: {
    label: "Alertas",
    description: "Elige qué avisos quieres recibir y dónde deben enviarse.",
  },
  "data-retention": {
    label: "Conservación y archivo",
    description:
      "Controla durante cuánto tiempo las conversaciones permanecen activas, archivadas y disponibles para búsqueda.",
  },
  "excluded-contacts": {
    label: "Contactos excluidos",
    description:
      "Contactos que Unboks debe ignorar por completo antes de responder, crear seguimientos o enviar alertas.",
  },
  "blocked-senders": {
    label: "Remitentes bloqueados",
    description: "Remitentes bloqueados en la bandeja activa del panel de Unboks.",
  },
  "auto-block": {
    label: "Bloqueo automático",
    description:
      "Bloquea automáticamente los abusos graves y los insultos reiterados, con revisión humana.",
  },
  preferences: {
    label: "Etiquetas y preferencias",
    description: "Personaliza la apariencia del panel y cómo se abren las respuestas.",
  },
};

const SPANISH_UPDATE_TYPES: Record<YourInfoUpdateType, string> = {
  general: "General",
  offer: "Oferta",
  holiday: "Festivo",
  hours: "Horarios",
  pricing: "Precios",
  policy: "Política",
  property: "Instalaciones",
  product: "Servicio",
  other: "Otro",
};

function updateTypeLabel(type: YourInfoUpdateType, fallback: string): string {
  return isSpainSpanishTenant() ? SPANISH_UPDATE_TYPES[type] : fallback;
}

import { motion, type HTMLMotionProps } from "framer-motion";

// ---------- Reusable presentation primitives ----------

function CategoryHeader({ title, description }: { title: string; description: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      className="mb-6 px-1 sm:px-2"
    >
      <h2 className="text-[22px] font-medium tracking-tight text-[#202124]">{title}</h2>
      <p className="mt-1 text-[15px] text-[#5f6368]">{description}</p>
    </motion.div>
  );
}

function Card({
  title,
  description,
  footer,
  children,
  className,
}: {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section 
      initial={{ opacity: 0, y: 8 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      className={cn("overflow-hidden rounded-[20px] border border-[#e8eaed] bg-white shadow-sm", className)}
    >
      {(title || description) && (
        <header className="border-b border-[#e8eaed] px-5 py-4 sm:px-6">
          {title && <h3 className="text-[15px] font-medium text-[#202124]">{title}</h3>}
          {description && <p className="mt-1 text-[14px] text-[#5f6368]">{description}</p>}
        </header>
      )}
      <div className="p-0">
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
      {footer && (
        <footer className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-[#e8eaed] bg-[#fbfbfd] px-5 py-4 sm:px-6">
          {footer}
        </footer>
      )}
    </motion.section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[14px] font-medium text-[#3c4043]">{children}</span>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "mt-1.5 w-full min-w-0 rounded-[10px] border border-[#dadce0] bg-white px-4 py-2.5 text-[15px] text-[#202124] outline-none transition-all",
        "placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]",
        props.className,
      )}
    />
  );
}

function PrimaryButton({
  children,
  ...rest
}: HTMLMotionProps<"button">) {
  return (
    <motion.button
      whileTap={{ scale: 0.97, opacity: 0.9 }}
      transition={{ duration: 0.1 }}
      {...rest}
      className={cn(
        "rounded-[10px] bg-[#1a73e8] px-5 py-2.5 text-[14px] font-medium text-white transition-colors",
        "hover:bg-[#1765c1] disabled:cursor-not-allowed disabled:bg-[#c8d4e6] disabled:active:scale-100",
        rest.className,
      )}
    >
      {children}
    </motion.button>
  );
}

function GhostButton({
  children,
  ...rest
}: HTMLMotionProps<"button">) {
  return (
    <motion.button
      whileTap={{ scale: 0.97, opacity: 0.9 }}
      transition={{ duration: 0.1 }}
      {...rest}
      className={cn(
        "rounded-[10px] border border-[#dadce0] bg-white px-4 py-2 text-[14px] font-medium text-[#3c4043] transition-colors hover:bg-[#f8f9fa] disabled:opacity-60 disabled:active:scale-100",
        rest.className,
      )}
    >
      {children}
    </motion.button>
  );
}

function SavedFlash({ visible }: { visible: boolean }) {
  return (
    <span
      className={cn(
        "text-[14px] text-[#137333] transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-live="polite"
    >
      {tenantText("Saved", "Guardado")}
    </span>
  );
}

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function websiteLinkItem(label: string, url: string): string {
  const cleanLabel = label.trim();
  return cleanLabel ? `${cleanLabel} - ${url}` : url;
}

function websiteLinkUrlFromItem(item: string): string {
  const match = item.match(/https?:\/\/\S+/i);
  return match ? match[0] : item;
}

function getWebsiteLinksBlock(blocks: SotBlock[]): SotBlock {
  return blocks.find((block) => block.id === WEBSITE_LINKS_BLOCK_ID) ?? {
    id: WEBSITE_LINKS_BLOCK_ID,
    title: tenantText("Website links", "Enlaces web"),
    content: tenantText(
      "Website page references saved in Source of Truth. Pages are not crawled or imported automatically.",
      "Referencias de páginas web guardadas como información de confianza. Las páginas no se importan automáticamente.",
    ),
    items: [],
  };
}

/**
 * Small status pill rendered next to each escalation alert channel so the
 * operator knows whether a saved destination is actually being delivered.
 */
function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const map: Record<DeliveryStatus, { label: string; className: string }> = {
    active: {
      label: "Active",
      className: "bg-[#e6f4ea] text-[#137333]",
    },
    pending_activation: {
      label: "Pending activation",
      className: "bg-[#fef7e0] text-[#7a5a00]",
    },
    not_configured: {
      label: "Not configured",
      className: "bg-[#f1f3f4] text-[#5f6368]",
    },
    saved_only: {
      label: "Not yet sending",
      className: "bg-[#f1f3f4] text-[#5f6368]",
    },
    provider_not_configured: {
      label: "Not yet connected",
      className: "bg-[#fef7e0] text-[#7a5a00]",
    },
    failed: {
      label: "Failed",
      className: "bg-[#fce8e6] text-[#a50e0e]",
    },
    default: {
      label: "Default",
      className: "bg-[#f1f3f4] text-[#5f6368]",
    },
    disabled: {
      label: "Disabled",
      className: "bg-[#f1f3f4] text-[#9aa0a6]",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
        className,
      )}
    >
      {tenantText(
        label,
        status === "active"
          ? "Activo"
          : status === "pending_activation"
            ? "Activación pendiente"
            : status === "not_configured"
              ? "Sin configurar"
              : status === "saved_only"
                ? "Aún no envía"
                : status === "provider_not_configured"
                  ? "Aún no conectado"
                  : status === "failed"
                    ? "Fallido"
                    : status === "disabled"
                      ? "Desactivado"
                      : "Predeterminado",
      )}
    </span>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 active:bg-[#fbfbfd] transition-colors rounded-lg -mx-2 px-2 sm:-mx-3 sm:px-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-[#202124]">{label}</p>
        {description && <p className="mt-1 text-[14px] text-[#5f6368]">{description}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="flex-shrink-0 data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
      />
    </div>
  );
}

// ---------- Your Info editable knowledge cards ----------

/**
 * Per-block edit/save/cancel for the Source-of-Truth knowledge.
 *
 * Edit model:
 *   - Title is intentionally NOT editable: section titles act as stable
 *     anchors the rest of the product (and any future server-side
 *     validation) keys off of.
 *   - `content` becomes a textarea.
 *   - `items` are edited as one item per line. Empty lines are dropped on
 *     save, so an operator can clear an item by emptying the line.
 *   - `subsections` get the same treatment per row. Subsection titles
 *     ARE editable because they're free-text under each block.
 *
 * The Save button is disabled when the draft is identical to the current
 * value (cheap JSON compare) or when a save is already in flight.
 * Cancel resets the draft back to the persisted block and exits edit
 * mode. A failed save surfaces a toast and keeps the operator in edit
 * mode with their unsaved changes intact, so nothing silently
 * disappears.
 */
function SotKnowledgeCard({
  block,
  onSave,
  isSavingExternal,
}: {
  block: SotBlock;
  onSave: (updated: SotBlock) => Promise<void>;
  isSavingExternal: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SotBlock>(block);
  const [busy, setBusy] = useState(false);

  // If the canonical block changes underneath us (e.g. a refresh of the
  // hook), and we're not in the middle of editing, mirror the new value
  // into the draft so the read view stays current.
  useEffect(() => {
    if (!editing) setDraft(block);
  }, [block, editing]);

  const dirty = useMemo(
    () => JSON.stringify(block) !== JSON.stringify(draft),
    [block, draft],
  );

  const handleCancel = () => {
    setDraft(block);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      // Normalise items + subsection items: drop blank lines and trim.
      const cleanedItems = draft.items
        ? draft.items.map((s) => s.trim()).filter(Boolean)
        : undefined;
      const cleanedSubs = draft.subsections?.map((s) => ({
        title: s.title.trim(),
        content: s.content?.trim() || undefined,
        items: s.items
          ? s.items.map((x) => x.trim()).filter(Boolean)
          : undefined,
      }));
      const payload: SotBlock = {
        ...draft,
        content: draft.content?.trim() || undefined,
        items: cleanedItems && cleanedItems.length > 0 ? cleanedItems : undefined,
        subsections: cleanedSubs && cleanedSubs.length > 0 ? cleanedSubs : undefined,
      };
      await onSave(payload);
      toast.success(tenantText("Saved.", "Guardado."));
      setEditing(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? tenantText(`Could not save: ${err.message}`, `No se pudo guardar: ${err.message}`)
          : tenantText("Could not save changes.", "No se pudieron guardar los cambios."),
      );
    } finally {
      setBusy(false);
    }
  };

  const isSaving = busy || isSavingExternal;

  return (
    <div className="rounded-[16px] border border-[#e8eaed] bg-white p-4 sm:p-5 shadow-sm transition-all duration-200">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium text-[#202124]">{block.title}</p>
        {!editing ? (
          <GhostButton
            type="button"
            onClick={() => setEditing(true)}
            className="flex flex-shrink-0 items-center gap-1.5 !px-3 !py-1.5 !bg-[#f8f9fa] !border-[#e8eaed] hover:!bg-[#f1f3f4] !text-[#3c4043]"
          >
            <Pencil className="h-3.5 w-3.5" />
            {tenantText("Edit", "Editar")}
          </GhostButton>
        ) : (
          <div className="flex flex-shrink-0 items-center gap-2">
            <GhostButton
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="!px-3 !py-1.5"
            >
              {tenantText("Cancel", "Cancelar")}
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={handleSave}
              disabled={!dirty || isSaving}
              className="flex items-center gap-1.5 !px-3 !py-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                  {tenantText("Saving", "Guardando")}
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> {tenantText("Save", "Guardar")}
                </>
              )}
            </PrimaryButton>
          </div>
        )}
      </div>

      {!editing ? (
        <SotBlockReadView block={block} />
      ) : (
        <SotBlockEditView draft={draft} onChange={setDraft} disabled={isSaving} />
      )}
    </div>
  );
}

function SotBlockReadView({ block }: { block: SotBlock }) {
  const hasContent = !!block.content;
  const hasItems = block.items && block.items.length > 0;
  const hasSubs = block.subsections && block.subsections.length > 0;
  if (!hasContent && !hasItems && !hasSubs) {
    return (
      <p className="text-[13px] italic text-[#9aa0a6]">
        {tenantText(
          "No information added yet. Use Edit to add details for your Agent.",
          "Aún no se ha añadido información. Usa Editar para añadir detalles para tu agente.",
        )}
      </p>
    );
  }
  return (
    <>
      {block.content && (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#5f6368]">
          {block.content}
        </p>
      )}
      {hasItems && (
        <ul className="mt-1 space-y-0.5">
          {block.items!.map((item, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-[#5f6368]">
              <span className="select-none text-[#9aa0a6]">–</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {hasSubs && (
        <div className="mt-3 space-y-3">
          {block.subsections!.map((sub, i) => (
            <div key={i} className="border-t border-[#e8eaed] pt-3">
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                {sub.title}
              </p>
              {sub.content && (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#5f6368]">
                  {sub.content}
                </p>
              )}
              {sub.items && sub.items.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {sub.items.map((item, j) => (
                    <li key={j} className="flex gap-2 text-[13px] text-[#5f6368]">
                      <span className="select-none text-[#9aa0a6]">–</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SotBlockEditView({
  draft,
  onChange,
  disabled,
}: {
  draft: SotBlock;
  onChange: (next: SotBlock) => void;
  disabled: boolean;
}) {
  const hasContent = draft.content !== undefined;
  const hasItems = draft.items !== undefined;
  const hasSubs = draft.subsections !== undefined && draft.subsections.length > 0;

  const inputCls =
    "w-full rounded-md border border-[#dadce0] bg-white px-2.5 py-2 text-[13px] text-[#202124] placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:outline-none focus:ring-1 focus:ring-[#1a73e8] disabled:cursor-not-allowed disabled:bg-[#f8f9fa]";

  return (
    <div className="space-y-3">
      {hasContent && (
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-[#5f6368]">
            {tenantText("Description", "Descripción")}
          </span>
          <textarea
            value={draft.content ?? ""}
            onChange={(e) => onChange({ ...draft, content: e.target.value })}
            disabled={disabled}
            rows={3}
            className={cn(inputCls, "min-h-[72px] resize-y")}
          />
        </label>
      )}

      {hasItems && (
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-[#5f6368]">
            {tenantText("Items (one per line)", "Elementos (uno por línea)")}
          </span>
          <textarea
            value={(draft.items ?? []).join("\n")}
            onChange={(e) =>
              onChange({ ...draft, items: e.target.value.split("\n") })
            }
            disabled={disabled}
            rows={Math.min(10, Math.max(3, (draft.items ?? []).length + 1))}
            className={cn(inputCls, "resize-y font-normal")}
          />
        </label>
      )}

      {hasSubs && (
        <div className="space-y-3">
          {draft.subsections!.map((sub, i) => (
            <div
              key={i}
              className="space-y-2 rounded-md border border-[#e8eaed] bg-[#fbfbfd] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <label className="block flex-1">
                  <span className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                    {tenantText("Section title", "Título de la sección")}
                  </span>
                  <input
                    type="text"
                    value={sub.title}
                    onChange={(e) => {
                      const subs = [...draft.subsections!];
                      subs[i] = { ...sub, title: e.target.value };
                      onChange({ ...draft, subsections: subs });
                    }}
                    disabled={disabled}
                    className={inputCls}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const subs = draft.subsections!.filter((_, j) => j !== i);
                    onChange({ ...draft, subsections: subs });
                  }}
                  disabled={disabled}
                  className="mt-5 rounded-md p-1.5 text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-60"
                  aria-label={tenantText("Remove section", "Eliminar sección")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {sub.content !== undefined && (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-[#5f6368]">
                    {tenantText("Description", "Descripción")}
                  </span>
                  <textarea
                    value={sub.content ?? ""}
                    onChange={(e) => {
                      const subs = [...draft.subsections!];
                      subs[i] = { ...sub, content: e.target.value };
                      onChange({ ...draft, subsections: subs });
                    }}
                    disabled={disabled}
                    rows={3}
                    className={cn(inputCls, "min-h-[64px] resize-y")}
                  />
                </label>
              )}
              {sub.items !== undefined && (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-[#5f6368]">
                    {tenantText("Items (one per line)", "Elementos (uno por línea)")}
                  </span>
                  <textarea
                    value={(sub.items ?? []).join("\n")}
                    onChange={(e) => {
                      const subs = [...draft.subsections!];
                      subs[i] = { ...sub, items: e.target.value.split("\n") };
                      onChange({ ...draft, subsections: subs });
                    }}
                    disabled={disabled}
                    rows={Math.min(8, Math.max(3, (sub.items ?? []).length + 1))}
                    className={cn(inputCls, "resize-y")}
                  />
                </label>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const subs: SotSubsection[] = [
                ...(draft.subsections ?? []),
                { title: tenantText("New section", "Nueva sección"), content: "" },
              ];
              onChange({ ...draft, subsections: subs });
            }}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-[#dadce0] px-2.5 py-1.5 text-[12px] font-medium text-[#5f6368] hover:bg-[#f8f9fa] disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {tenantText("Add section", "Añadir sección")}
          </button>
        </div>
      )}

      {/* If a block has no content/items/subsections at all, give the
          operator a way to start adding either a description or list. */}
      {!hasContent && !hasItems && !hasSubs && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...draft, content: "" })}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-[#dadce0] px-2.5 py-1.5 text-[12px] font-medium text-[#5f6368] hover:bg-[#f8f9fa] disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {tenantText("Add description", "Añadir descripción")}
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...draft, items: [""] })}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-[#dadce0] px-2.5 py-1.5 text-[12px] font-medium text-[#5f6368] hover:bg-[#f8f9fa] disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {tenantText("Add list", "Añadir lista")}
          </button>
        </div>
      )}
    </div>
  );
}

function formatUpdateDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(getTenantUiConfig().dateLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SavedKnowledgeUpdateCard({
  update,
  onUpdate,
  onSetActive,
  onRemove,
}: {
  update: YourInfoUpdate;
  onUpdate: (
    id: string,
    input: Partial<Pick<YourInfoUpdate, "type" | "text" | "active" | "startDate" | "endDate">>,
  ) => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftType, setDraftType] = useState<YourInfoUpdateType>(update.type);
  const [draftText, setDraftText] = useState(update.text);
  const [draftStart, setDraftStart] = useState(update.startDate ?? "");
  const [draftEnd, setDraftEnd] = useState(update.endDate ?? "");
  const [busy, setBusy] = useState(false);
  const typeLabel = UPDATE_TYPES.find((t) => t.value === update.type)?.label ?? update.type;
  const draftDirty =
    draftType !== update.type ||
    draftText !== update.text ||
    draftStart !== (update.startDate ?? "") ||
    draftEnd !== (update.endDate ?? "");
  const canSave = draftText.trim().length > 0 && draftDirty && !busy;

  useEffect(() => {
    if (editing) return;
    setDraftType(update.type);
    setDraftText(update.text);
    setDraftStart(update.startDate ?? "");
    setDraftEnd(update.endDate ?? "");
  }, [editing, update]);

  const handleCancel = () => {
    setDraftType(update.type);
    setDraftText(update.text);
    setDraftStart(update.startDate ?? "");
    setDraftEnd(update.endDate ?? "");
    setEditing(false);
  };

  const handleSave = async () => {
    const text = draftText.trim();
    if (!text) {
      toast.error(tenantText(
        "Write a note before saving.",
        "Escribe una nota antes de guardar.",
      ));
      return;
    }
    setBusy(true);
    try {
      await onUpdate(update.id, {
        type: draftType,
        text,
        active: update.active,
        startDate: draftStart || undefined,
        endDate: draftEnd || undefined,
      });
      toast.success(tenantText(
        "Knowledge update saved.",
        "Actualización de conocimiento guardada.",
      ));
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error && err.message
        ? err.message
        : tenantText(
            "Could not save knowledge update.",
            "No se ha podido guardar la actualización de conocimiento.",
          );
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={cn(
        "rounded-xl border border-[#e8eaed] bg-white p-3",
        !update.active && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="inline-flex items-center rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[11px] font-medium text-[#3c4043]">
          {typeLabel}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            update.active
              ? "bg-[#e6f4ea] text-[#137333]"
              : "bg-[#f6f8fc] text-[#5f6368]",
          )}
        >
          {update.active
            ? tenantText("Active", "Activo")
            : tenantText("Inactive", "Inactivo")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full px-2 py-1 text-[12px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
            >
              {tenantText("Edit", "Editar")}
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                await onRemove(update.id);
              } catch (err) {
                const msg = err instanceof Error && err.message
                  ? err.message
                  : tenantText(
                      "Could not remove update.",
                      "No se ha podido eliminar la actualización.",
                    );
                toast.error(msg);
              }
            }}
            disabled={busy}
            aria-label={tenantText("Remove update", "Eliminar actualización")}
            className="grid h-7 w-7 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-3 rounded-lg border border-[#e8eaed] bg-[#fbfbfd] p-3">
          <div>
            <FieldLabel>{tenantText("Type", "Tipo")}</FieldLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {UPDATE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setDraftType(t.value)}
                  disabled={busy}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] transition-colors disabled:opacity-60",
                    draftType === t.value
                      ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                      : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f6f8fc]",
                  )}
                >
                  {updateTypeLabel(t.value, t.label)}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <FieldLabel>{tenantText("Note", "Nota")}</FieldLabel>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              disabled={busy}
              rows={4}
              className="mt-1 w-full min-w-0 resize-y rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] disabled:bg-[#f8f9fa]"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>
                {tenantText("Start date (optional)", "Fecha de inicio (opcional)")}
              </FieldLabel>
              <TextInput
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="block">
              <FieldLabel>
                {tenantText("End date (optional)", "Fecha de fin (opcional)")}
              </FieldLabel>
              <TextInput
                type="date"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <GhostButton type="button" onClick={handleCancel} disabled={busy}>
              {tenantText("Cancel", "Cancelar")}
            </GhostButton>
            <PrimaryButton type="button" onClick={handleSave} disabled={!canSave}>
              {busy
                ? tenantText("Saving...", "Guardando...")
                : tenantText("Save changes", "Guardar cambios")}
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-[#202124]">
            {update.text}
          </p>
          <KnowledgeMediaAttachments knowledgeId={update.id} />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5f6368]">
            <span>
              {tenantText("Added", "Añadido el")} {formatUpdateDate(update.createdAt)}
            </span>
            {update.updatedAt && update.updatedAt !== update.createdAt && (
              <span>
                {tenantText("Updated", "Actualizado el")} {formatUpdateDate(update.updatedAt)}
              </span>
            )}
            {update.startDate && (
              <span>{tenantText("From", "Desde")} {update.startDate}</span>
            )}
            {update.endDate && (
              <span>{tenantText("Until", "Hasta")} {update.endDate}</span>
            )}
            <button
              type="button"
              onClick={async () => {
                try {
                  await onSetActive(update.id, !update.active);
                } catch (err) {
                  const msg = err instanceof Error && err.message
                    ? err.message
                    : tenantText(
                        "Could not update status.",
                        "No se ha podido actualizar el estado.",
                      );
                  toast.error(msg);
                }
              }}
              className="ml-auto text-[#1a73e8] hover:underline"
            >
              {update.active
                ? tenantText("Mark inactive", "Marcar como inactivo")
                : tenantText("Reactivate", "Reactivar")}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

// =====================================================
// Page
// =====================================================

const CATEGORY_IDS: ReadonlySet<string> = new Set<CategoryId>([
  "workspace",
  "your-info",
  "agent-personality",
  "agent-learnings",
  "escalation",
  "data-retention",
  "excluded-contacts",
  "auto-block",
  "blocked-senders",
  "preferences",
]);

function categoryFromSearch(search: string): CategoryId | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const raw = params.get("category");
    if (raw && CATEGORY_IDS.has(raw)) return raw as CategoryId;
  } catch {
    // ignore — fall through to null
  }
  return null;
}

export default function Settings() {
  // Settings supports `?category=<id>` deep links so other surfaces
  // can jump straight to the right tab. URL is the source of truth:
  // clicks update the URL, the URL drives `active`.
  const [, navigate] = useLocation();
  const search = useSearch();
  const urlCategory = categoryFromSearch(search);
  const [active, setActive] = useState<CategoryId>(urlCategory ?? "workspace");
  // Keep local state in sync if the URL changes from outside (deep link
  // arrives, browser back/forward, etc.).
  useEffect(() => {
    const requested = urlCategory ?? "workspace";
    if (requested === active) return;
    setActive(requested);
  }, [urlCategory, active]);
  const selectCategory = (id: CategoryId) => {
    setActive(id);
    // Default tab keeps the URL clean; every other tab encodes itself
    // in the query string so the deep link survives refresh + share.
    if (id === "workspace") navigate("/settings");
    else navigate(`/settings?category=${encodeURIComponent(id)}`);
  };

  // Hooks (unchanged behaviour) -------------------------
  const { emailClient, setEmailClient } = useEmailSettings();
  const {
    prefs: notifyPrefs,
    save: saveNotifyPrefs,
    isLoading: notifyLoading,
    isSaving: notifySaving,
    source: notifySource,
    loadError: notifyLoadError,
    deliveryStatuses: notifyDeliveryStatuses,
    defaultEmailAddress: notifyDefaultEmail,
  } = useEscalationNotificationPrefs();
  const { settings: account, save: saveAccount } = useAccountSettings();
  const {
    settings: agentNameSettings,
    isLoading: agentNameLoading,
    save: saveAgentName,
  } = useAgentNameSettings();
  const {
    data: responseTimingSettings,
    isLoading: responseTimingLoading,
    isError: responseTimingError,
  } = useResponseTimingSettings();
  const saveResponseTiming = useSaveResponseTimingSettings();
  const {
    data: workspaceLabelsData,
    isLoading: workspaceLabelsLoading,
    isError: workspaceLabelsError,
  } = useWorkspaceLabels();
  const saveWorkspaceLabels = useSaveWorkspaceLabels();
  const workspaceLabels = workspaceLabelsData ?? workspaceLabelsFallback();
  const { updates, addUpdate, updateUpdate, setActive: setUpdateActive, removeUpdate } = useYourInfoUpdates();

  const {
    blocks: sotBlocks,
    saveBlock: saveSotBlock,
    isSaving: sotSaving,
    isLoading: sotLoading,
    loadError: sotLoadError,
  } = useSot();

  // Workspace draft -------------------------------------
  const [accountDraft, setAccountDraft] = useState<AccountSettings>(account);
  useEffect(() => {
    setAccountDraft(account);
  }, [account]);
  const [accountSaved, setAccountSaved] = useState(false);
  const [bookingsLabelDraft, setBookingsLabelDraft] = useState(workspaceLabels.bookingsLabel);
  useEffect(() => {
    setBookingsLabelDraft(workspaceLabels.bookingsLabel);
  }, [workspaceLabels.bookingsLabel]);
  const [agentNameDraft, setAgentNameDraft] = useState("Marina");
  const [agentNameSaved, setAgentNameSaved] = useState(false);
  useEffect(() => {
    setAgentNameDraft(agentNameSettings.tenantValue || agentNameSettings.effectiveName || "Marina");
  }, [agentNameSettings]);
  const normalizedAgentNameDraft = agentNameDraft.trim().replace(/\s+/g, " ");
  const agentNameError = agentNameDraftError(agentNameDraft);
  const agentNameOverrideActive = agentNameSettings.source === "admin_override";
  const agentNameDirty = normalizedAgentNameDraft !== (agentNameSettings.tenantValue || "");
  const canSaveAgentName =
    !agentNameLoading && !agentNameOverrideActive && agentNameDirty && !agentNameError;
  const responseTiming = responseTimingSettings?.effective;
  const responseTimingTenant = responseTimingSettings?.tenantValue;
  const responseTimingOverrideActive = responseTimingSettings?.source === "admin_override";
  const responseTimingMode = responseTimingTenant?.mode ?? "preset";
  const accountDirty = useMemo(
    () => JSON.stringify(account) !== JSON.stringify(accountDraft),
    [account, accountDraft],
  );
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error(
        tenantText(
          "Logo must be a PNG, JPG, WebP or SVG image.",
          "El logotipo debe ser una imagen PNG, JPG, WebP o SVG.",
        ),
      );
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(
        tenantText("Logo must be under 2 MB.", "El logotipo debe ocupar menos de 2 MB."),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (dataUrl) setAccountDraft((d) => ({ ...d, logoDataUrl: dataUrl }));
    };
    reader.onerror = () =>
      toast.error(tenantText("Could not read that image.", "No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  };

  // Your Info Updates composer state --------------------
  const [updateText, setUpdateText] = useState("");
  const [updateType, setUpdateType] = useState<YourInfoUpdateType>("general");
  const [updateStart, setUpdateStart] = useState("");
  const [updateEnd, setUpdateEnd] = useState("");

  // Escalation Alerts draft -----------------------------
  const [notifyDraft, setNotifyDraft] = useState(notifyPrefs);
  const [notifySaved, setNotifySaved] = useState(false);
  // Re-sync the draft whenever the backend-loaded prefs change (initial
  // GET, after a successful PUT, or after a refetch). Without this the
  // form would keep showing whatever was in localStorage even after the
  // backend's true settings arrived.
  useEffect(() => {
    setNotifyDraft(notifyPrefs);
  }, [notifyPrefs]);
  const notifyDirty = useMemo(
    () => JSON.stringify(notifyPrefs) !== JSON.stringify(notifyDraft),
    [notifyPrefs, notifyDraft],
  );

  // Validate the draft: any enabled channel must have a non-empty
  // destination, otherwise the backend would reject the save anyway.
  // The alternative email is optional; when filled it must look like an
  // email address, but it never blocks WhatsApp/Telegram/Messenger saves
  // when left empty.
  const notifyValidationError = useMemo(() => {
    const labels: Record<NotifyChannelKey, string> = {
      whatsapp: "WhatsApp",
      messenger: "Messenger",
      telegram: "Telegram",
    };
    for (const key of Object.keys(labels) as NotifyChannelKey[]) {
      if (ALERT_CHANNEL_SUPPORT[key] !== "available") continue;
      const p = notifyDraft[key];
      if (p.enabled && p.destination.trim().length === 0) {
        return tenantText(
          `Add a ${labels[key]} destination, or turn ${labels[key]} off.`,
          `Añade un destino para ${labels[key]} o desactiva ${labels[key]}.`,
        );
      }
    }
    const alt = notifyDraft.alternativeEmail.trim();
    if (alt.length > 0 && !ALT_EMAIL_RE.test(alt)) {
      return tenantText(
        "Enter a valid email address.",
        "Introduce una dirección de correo válida.",
      );
    }
    return null;
  }, [notifyDraft]);

  const handleSaveNotifyPrefs = async () => {
    if (notifyValidationError) {
      toast.error(notifyValidationError);
      return;
    }
    try {
      await saveNotifyPrefs(notifyDraft);
      setNotifySaved(true);
    } catch (err) {
      // Surface the backend message verbatim, never pretend it saved.
      // Fallback copy is only used when the error has no usable message.
      let msg = tenantText(
        "Couldn't save escalation alerts. Please try again.",
        "No se pudieron guardar las alertas. Inténtalo de nuevo.",
      );
      if (err instanceof ApiError) {
        if (err.message && err.message.trim().length > 0) {
          msg = err.message;
        } else {
          msg = tenantText(
            `Save failed (${err.status}).`,
            `No se pudo guardar (${err.status}).`,
          );
        }
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      toast.error(msg);
    }
  };

  // Auto-clear "Saved" flashes
  useEffect(() => {
    if (!accountSaved) return;
    const t = window.setTimeout(() => setAccountSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [accountSaved]);
  useEffect(() => {
    if (!notifySaved) return;
    const t = window.setTimeout(() => setNotifySaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [notifySaved]);
  const currentCategoryBase = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];
  const currentCategory = isSpainSpanishTenant()
    ? { ...currentCategoryBase, ...SPANISH_CATEGORIES[currentCategoryBase.id] }
    : currentCategoryBase;
  const categoryLabel = (category: (typeof CATEGORIES)[number]) =>
    isSpainSpanishTenant() ? SPANISH_CATEGORIES[category.id].label : category.label;

  return (
    <DashboardShell
      activeNav="settings"
      pageTitle={tenantText("Settings", "Configuración")}
      pageSubtitle={tenantText(
        "Manage your workspace, Agent information, alerts, and preferences.",
        "Gestiona tu espacio de trabajo, la información del agente, las alertas y las preferencias.",
      )}
      hideRefresh
    >
      <div className="min-h-full bg-[#f8f9fb]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">

          {/* Top tab bar — horizontally scrollable on mobile, full-width on desktop */}
          <nav
            aria-label={tenantText("Settings categories", "Categorías de configuración")}
            className="mb-6 border-b border-[#e8eaed]"
          >
            <label className="mb-3 block md:hidden">
              <span className="mb-1.5 block text-[12px] font-medium text-[#5f6368]">
                {tenantText("Settings section", "Sección de configuración")}
              </span>
              <select
                value={active}
                onChange={(event) => selectCategory(event.target.value as CategoryId)}
                className="w-full rounded-xl border border-[#dadce0] bg-white px-3 py-2.5 text-[14px] font-medium text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {categoryLabel(cat)}
                  </option>
                ))}
              </select>
            </label>
            <div
              role="tablist"
              className="-mb-px hidden gap-1 overflow-x-auto md:flex sm:gap-2"
              style={{ scrollbarWidth: "none" }}
            >
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = cat.id === active;
                return (
                  <button
                    key={cat.id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => selectCategory(cat.id)}
                    className={cn(
                      "inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors sm:px-4",
                      isActive
                        ? "border-[#1a73e8] text-[#1a73e8] font-medium"
                        : "border-transparent text-[#5f6368] hover:text-[#202124] hover:border-[#dadce0]",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5",
                        isActive ? "text-[#1a73e8]" : "text-[#9aa0a6]",
                      )}
                    />
                    {categoryLabel(cat)}
                  </button>
                );
              })}
            </div>
          </nav>

          <div>
            <main className="min-w-0">
              <CategoryHeader
                title={currentCategory.label}
                description={currentCategory.description}
              />

              {active === "workspace" && (
                <div className="space-y-5">
                {!isSpainSpanishTenant() && (
                <Card
                  title="Workspace menu label"
                  description="Choose the label shown for the appointment/order workspace in the sidebar and mobile menu."
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {workspaceLabels.presets.map((option) => (
                        <button
                          key={option}
                          type="button"
                          disabled={workspaceLabelsLoading || saveWorkspaceLabels.isPending}
                          onClick={() => setBookingsLabelDraft(option)}
                          className={cn(
                            "rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            bookingsLabelDraft === option
                              ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                              : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f6f8fc]",
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <label className="block max-w-md">
                      <FieldLabel>Custom label</FieldLabel>
                      <TextInput
                        value={bookingsLabelDraft}
                        maxLength={24}
                        disabled={workspaceLabelsLoading || saveWorkspaceLabels.isPending}
                        placeholder="Appointments, Bookings, Orders..."
                        onChange={(e) => setBookingsLabelDraft(e.target.value)}
                      />
                    </label>
                    {workspaceLabelsError && (
                      <p className="rounded-lg border border-[#f6d48f] bg-[#fff8e1] px-3 py-2 text-[12px] text-[#7a5a00]">
                        Could not load the saved label. Showing the default until the dashboard reconnects.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <PrimaryButton
                        type="button"
                        disabled={
                          workspaceLabelsLoading ||
                          saveWorkspaceLabels.isPending ||
                          !bookingsLabelDraft.trim() ||
                          bookingsLabelDraft.trim() === workspaceLabels.bookingsLabel
                        }
                        onClick={async () => {
                          try {
                            const next = await saveWorkspaceLabels.mutateAsync(bookingsLabelDraft.trim());
                            setBookingsLabelDraft(next.bookingsLabel);
                            toast.success("Workspace label saved.");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Could not save workspace label.");
                          }
                        }}
                      >
                        {saveWorkspaceLabels.isPending ? "Saving..." : "Save label"}
                      </PrimaryButton>
                      <p className="text-[12px] text-[#5f6368]">
                        Current active label:{" "}
                        <span className="font-medium text-[#202124]">
                          {workspaceLabels.bookingsLabel}
                        </span>
                      </p>
                    </div>
                  </div>
                </Card>
                )}
                <Card
                  title={tenantText("Business identity", "Identidad de la empresa")}
                  description={tenantText(
                    "Used inside this dashboard. Public website and Agent usage will be connected by the Unboks team.",
                    "Se utiliza dentro de este panel. El equipo de Unboks conectará su uso con la web pública y el agente.",
                  )}
                  footer={
                    <>
                      <SavedFlash visible={accountSaved} />
                      <PrimaryButton
                        type="button"
                        disabled={!accountDirty}
                        onClick={async () => {
                          try {
                            await saveAccount(accountDraft);
                            setAccountSaved(true);
                          } catch (err) {
                            const msg = err instanceof Error && err.message
                              ? err.message
                              : tenantText(
                                  "Could not save workspace settings.",
                                  "No se pudo guardar la configuración del espacio de trabajo.",
                                );
                            toast.error(msg);
                          }
                        }}
                      >
                        {tenantText("Save changes", "Guardar cambios")}
                      </PrimaryButton>
                    </>
                  }
                >
                  <div className="space-y-4">
                    {/* Logo first — Linear pattern */}
                    <div>
                      <FieldLabel>{tenantText("Logo", "Logotipo")}</FieldLabel>
                      <div className="mt-2 flex items-start gap-4">
                        <div className="grid h-20 w-20 flex-shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e8eaed] bg-[#f6f8fc]">
                          {accountDraft.logoDataUrl ? (
                            <img
                              src={accountDraft.logoDataUrl}
                              alt={tenantText("Logo preview", "Vista previa del logotipo")}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-[11px] text-[#9aa0a6]">
                              {tenantText("No logo", "Sin logotipo")}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-2">
                            <GhostButton
                              type="button"
                              onClick={() => logoInputRef.current?.click()}
                            >
                              {tenantText("Upload logo", "Subir logotipo")}
                            </GhostButton>
                            {accountDraft.logoDataUrl && (
                              <GhostButton
                                type="button"
                                onClick={() =>
                                  setAccountDraft((d) => ({ ...d, logoDataUrl: undefined }))
                                }
                                className="text-[#5f6368]"
                              >
                                {tenantText("Remove", "Eliminar")}
                              </GhostButton>
                            )}
                            <input
                              ref={logoInputRef}
                              type="file"
                              accept={ALLOWED_LOGO_TYPES.join(",")}
                              onChange={handleLogoSelect}
                              className="hidden"
                            />
                          </div>
                          <p className="mt-2 text-[12px] text-[#5f6368]">
                            {tenantText(
                              "PNG, JPG, WebP or SVG. Max 2 MB. Used in your dashboard.",
                              "PNG, JPG, WebP o SVG. Máximo 2 MB. Se utiliza en tu panel.",
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {([
                        {
                          key: "businessName",
                          label: tenantText("Business name", "Nombre de la empresa"),
                          type: "text",
                          placeholder: "Acme Co.",
                        },
                        {
                          key: "contactEmail",
                          label: tenantText("Contact email", "Correo de contacto"),
                          type: "email",
                          placeholder: "hola@empresa.es",
                        },
                        {
                          key: "phone",
                          label: tenantText("Phone number", "Número de teléfono"),
                          type: "tel",
                          placeholder: "+34 600 000 000",
                        },
                        {
                          key: "website",
                          label: tenantText("Website", "Sitio web"),
                          type: "url",
                          placeholder: "https://empresa.es",
                        },
                      ] as const).map((field) => (
                        <label key={field.key} className="block">
                          <FieldLabel>{field.label}</FieldLabel>
                          <TextInput
                            type={field.type}
                            value={accountDraft[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(e) =>
                              setAccountDraft((d) => ({ ...d, [field.key]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </Card>
                </div>
              )}

              {active === "your-info" && (
                <div className="space-y-5">
                  <Card
                    title={tenantText("Add knowledge", "Añadir conocimiento")}
                    description={tenantText(
                      "Quickly add business information your Unboks Agent can use when replying to customers. Examples: holiday hours, offers, pricing rules, policies.",
                      "Añade información de la empresa que el agente de Unboks pueda usar al responder a personas interesadas: horarios en festivos, servicios, precios o políticas.",
                    )}
                  >
                    <div className="space-y-4">
                      <div>
                        <FieldLabel>{tenantText("Type", "Tipo")}</FieldLabel>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {UPDATE_TYPES.map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => setUpdateType(t.value)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-[12px] transition-colors",
                                updateType === t.value
                                  ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                                  : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f6f8fc]",
                              )}
                            >
                              {updateTypeLabel(t.value, t.label)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block">
                        <FieldLabel>{tenantText("Note", "Nota")}</FieldLabel>
                        <textarea
                          value={updateText}
                          onChange={(e) => setUpdateText(e.target.value)}
                          rows={3}
                          placeholder={tenantText(
                            "Example: We are closed on Christmas Day, but open again on December 26.",
                            "Ejemplo: Cerramos el día de Navidad y volvemos a abrir el 26 de diciembre.",
                          )}
                          className="mt-1 w-full min-w-0 resize-y rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] text-[#202124] outline-none placeholder:text-[#9aa0a6] focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                        />
                      </label>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <FieldLabel>
                            {tenantText("Start date (optional)", "Fecha de inicio (opcional)")}
                          </FieldLabel>
                          <TextInput
                            type="date"
                            value={updateStart}
                            onChange={(e) => setUpdateStart(e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <FieldLabel>
                            {tenantText("End date (optional)", "Fecha de fin (opcional)")}
                          </FieldLabel>
                          <TextInput
                            type="date"
                            value={updateEnd}
                            onChange={(e) => setUpdateEnd(e.target.value)}
                          />
                        </label>
                      </div>

                      <div>
                        <PrimaryButton
                          type="button"
                          onClick={async () => {
                            const text = updateText.trim();
                            if (!text) {
                              toast.error(
                                tenantText(
                                  "Write a short note before adding the update.",
                                  "Escribe una nota breve antes de añadir la actualización.",
                                ),
                              );
                              return;
                            }
                            try {
                              await addUpdate({
                                type: updateType,
                                text,
                                startDate: updateStart || undefined,
                                endDate: updateEnd || undefined,
                              });
                              setUpdateText("");
                              setUpdateStart("");
                              setUpdateEnd("");
                              setUpdateType("general");
                              toast.success(tenantText("Update added.", "Actualización añadida."));
                            } catch (err) {
                              const msg = err instanceof Error && err.message
                                ? err.message
                                : tenantText(
                                    "Could not save knowledge update.",
                                    "No se pudo guardar la actualización de conocimiento.",
                                  );
                              toast.error(msg);
                            }
                          }}
                        >
                          {tenantText("Save knowledge", "Guardar conocimiento")}
                        </PrimaryButton>
                      </div>
                    </div>
                  </Card>

                  <WebsiteLinksCard
                    blocks={sotBlocks}
                    onSaveBlock={saveSotBlock}
                    isSavingBlock={sotSaving}
                    isLoading={sotLoading}
                    loadError={sotLoadError}
                  />

                  <Card
                    title={tenantText(
                      "Saved knowledge updates",
                      "Actualizaciones de conocimiento guardadas",
                    )}
                    description={tenantText(
                      "Notes you've added. Your Agent can use this information when replying to customers.",
                      "Notas añadidas que el agente puede usar al responder a personas interesadas.",
                    )}
                  >
                    {updates.length === 0 ? (
                      <p className="text-[13px] text-[#9aa0a6]">
                        {tenantText("No updates yet.", "Todavía no hay actualizaciones.")}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {updates.map((u) => {
                          return (
                            <SavedKnowledgeUpdateCard
                              key={u.id}
                              update={u}
                              onUpdate={updateUpdate}
                              onSetActive={setUpdateActive}
                              onRemove={removeUpdate}
                            />
                          );
                        })}
                      </ul>
                    )}
                  </Card>

                  <Card
                    title={tenantText("Upload knowledge files", "Subir archivos de conocimiento")}
                    description={tenantText(
                      "Documents, menus, price lists, FAQs, and policies your Agent can use when replying.",
                      "Documentos, tarifas, preguntas frecuentes y políticas que el agente puede usar al responder.",
                    )}
                  >
                    <KnowledgeFileUploader />
                  </Card>

                  <Card
                    title={tenantText("Connect cloud storage", "Conectar almacenamiento en la nube")}
                    description={tenantText(
                      "Link folders from Google Drive, OneDrive, or Dropbox so your Agent can use the documents inside.",
                      "Vincula carpetas de Google Drive, OneDrive o Dropbox para que el agente pueda usar sus documentos.",
                    )}
                  >
                    <CloudKnowledgeConnections />
                  </Card>

                  <YourInfoKnowledge
                    blocks={sotBlocks}
                    onSaveBlock={saveSotBlock}
                    isSavingBlock={sotSaving}
                    isLoading={sotLoading}
                    loadError={sotLoadError}
                  />
                </div>
              )}

              {active === "escalation" && (
                <Card
                  title={tenantText("Alerts", "Alertas")}
                  description={tenantText(
                    "Choose which alerts you want to receive and where they should be sent.",
                    "Elige qué alertas quieres recibir y dónde deben enviarse.",
                  )}
                  footer={
                    <>
                      <SavedFlash visible={notifySaved} />
                      <PrimaryButton
                        type="button"
                        disabled={!notifyDirty || notifySaving || notifyLoading}
                        onClick={handleSaveNotifyPrefs}
                      >
                        {notifySaving
                          ? tenantText("Saving…", "Guardando…")
                          : tenantText("Save changes", "Guardar cambios")}
                      </PrimaryButton>
                    </>
                  }
                >
                  {notifySource === "local" && notifyLoadError && (
                    <div className="mb-3 rounded-lg border border-[#fde293] bg-[#fef7e0] px-3 py-2 text-[12px] text-[#5f6368]">
                      {notifyLoadError}
                    </div>
                  )}
                  {notifyValidationError && (
                    <div className="mb-3 rounded-lg border border-[#f4c7c3] bg-[#fce8e6] px-3 py-2 text-[12px] text-[#a50e0e]">
                      {notifyValidationError}
                    </div>
                  )}

                  {/* Alert types — which kinds of notifications the
                      operator wants. Persisted via the same
                      /settings/escalation-alerts endpoint as channel
                      destinations: edits go into `notifyDraft` and are
                      saved by the existing Save button below alongside
                      every other field, so destinations are always
                      preserved on save. */}
                  <div className="mb-4">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                      {tenantText("Alert types", "Tipos de alerta")}
                    </p>
                    <div className="mt-2 divide-y divide-[#f1f3f4] rounded-lg border border-[#e8eaed]">
                      <div className="flex items-start justify-between gap-4 px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-[#202124]">
                            {tenantText("Escalation alerts", "Alertas de respuesta humana")}
                          </p>
                          <p className="mt-0.5 text-[12px] text-[#5f6368]">
                            {tenantText(
                              "Get notified when your Agent needs human help or a customer conversation requires attention.",
                              "Recibe un aviso cuando el agente necesite ayuda humana o una conversación requiera atención.",
                            )}
                          </p>
                        </div>
                        <Switch
                          checked={notifyDraft.alertTypes.escalations}
                          onCheckedChange={(v) =>
                            setNotifyDraft((d) => ({
                              ...d,
                              alertTypes: { ...d.alertTypes, escalations: v },
                            }))
                          }
                          disabled={notifyLoading || notifySaving}
                          aria-label={tenantText(
                            "Receive escalation alerts",
                            "Recibir alertas de respuesta humana",
                          )}
                          className="mt-0.5 data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
                        />
                      </div>
                      <div className="flex items-start justify-between gap-4 px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-[#202124]">
                            {tenantText("Appointment alerts", "Alertas de seguimiento")}
                          </p>
                          <p className="mt-0.5 text-[12px] text-[#5f6368]">
                            {tenantText(
                              "Get notified when a customer confirms an appointment, booking, order, or scheduled call.",
                              "Recibe un aviso cuando un seguimiento esté listo para que el equipo contacte con la persona.",
                            )}
                          </p>
                        </div>
                        <Switch
                          checked={notifyDraft.alertTypes.appointments}
                          onCheckedChange={(v) =>
                            setNotifyDraft((d) => ({
                              ...d,
                              alertTypes: { ...d.alertTypes, appointments: v },
                            }))
                          }
                          disabled={notifyLoading || notifySaving}
                          aria-label={tenantText(
                            "Receive appointment alerts",
                            "Recibir alertas de seguimiento",
                          )}
                          className="mt-0.5 data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                      {tenantText("Where alerts are sent", "Dónde se envían las alertas")}
                    </p>
                  </div>

                  <div className="divide-y divide-[#f1f3f4]">
                    {/* Email row — mandatory */}
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[14px] text-[#202124]">Email</p>
                        <p
                          className="mt-0.5 truncate text-[12px] text-[#5f6368]"
                          title={notifyDefaultEmail ?? undefined}
                        >
                          {notifyDefaultEmail
                            ? tenantText(
                                `Always on, sent to ${notifyDefaultEmail}`,
                                `Siempre activo; se envía a ${notifyDefaultEmail}`,
                              )
                            : tenantText(
                                "Always on, uses your default account email",
                                "Siempre activo; usa el correo predeterminado de la cuenta",
                              )}
                        </p>
                        {notifyPrefs.alternativeEmail.trim().length > 0 && (
                          <p
                            className="mt-0.5 truncate text-[12px] text-[#5f6368]"
                            title={notifyPrefs.alternativeEmail.trim()}
                          >
                            {tenantText("Alternative", "Alternativo")}:{" "}
                            {notifyPrefs.alternativeEmail.trim()}
                          </p>
                        )}
                      </div>
                      <DeliveryBadge status={notifyDeliveryStatuses.email ?? "default"} />
                    </div>

                    {/* Alternative email input — optional secondary recipient */}
                    <div className="py-3">
                      <label
                        htmlFor="escalation-alt-email"
                        className="block text-[12px] font-medium text-[#5f6368]"
                      >
                        {tenantText("Alternative email", "Correo alternativo")}
                      </label>
                      <input
                        id="escalation-alt-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        value={notifyDraft.alternativeEmail}
                        onChange={(e) =>
                          setNotifyDraft((d) => ({ ...d, alternativeEmail: e.target.value }))
                        }
                        placeholder="segundo@ejemplo.es"
                        disabled={notifyLoading || notifySaving}
                        className="mt-1 h-9 w-full rounded-md border border-[#dadce0] bg-white px-3 text-[14px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8] disabled:bg-[#f8f9fa] disabled:text-[#9aa0a6]"
                      />
                      <p className="mt-1 text-[11px] text-[#5f6368]">
                        {tenantText(
                          "Send alerts to an additional email address. Leave empty to use only the default.",
                          "Envía alertas a otro correo. Déjalo vacío para usar solo el predeterminado.",
                        )}
                      </p>
                    </div>

                    {([
                      { key: "whatsapp", label: "WhatsApp", placeholder: "+599 9 123 4567" },
                      { key: "messenger", label: "Messenger", placeholder: "username or profile link" },
                      { key: "telegram", label: "Telegram", placeholder: "@username or phone number" },
                    ] as { key: NotifyChannelKey; label: string; placeholder: string }[]).map(
                      (row) => {
                        const pref = notifyDraft[row.key];
                        const status = notifyDeliveryStatuses[row.key];
                        const supported = ALERT_CHANNEL_SUPPORT[row.key] === "available";
                        // WhatsApp shows its status badge in every state
                        // (Active / Pending activation / Not configured /
                        // Disabled) so the operator always knows where the
                        // channel stands. Telegram and Messenger are
                        // intentionally locked until real providers exist.
                        const showBadge =
                          status !== undefined &&
                          (row.key === "whatsapp" || (supported && pref.enabled));
                        return (
                          <div
                            key={row.key}
                            className={cn(
                              "py-3",
                              !supported && "rounded-lg bg-[#f8f9fa] px-3 opacity-85",
                            )}
                          >
                            <div className="flex items-center justify-between gap-4 py-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className={cn("text-[14px]", supported ? "text-[#202124]" : "text-[#5f6368]")}>
                                    {row.label}
                                  </p>
                                  {!supported && (
                                    <span className="rounded-full border border-[#e0e3e7] bg-white px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">
                                      {tenantText("Coming soon", "Próximamente")}
                                    </span>
                                  )}
                                </div>
                                {!supported && (
                                  <p className="mt-1 max-w-[520px] text-[12px] leading-5 text-[#6b7280]">
                                    {tenantText(
                                      "Not active yet. We will enable this after the provider integration is wired and tested by Unboks.",
                                      "Aún no está activo. Lo habilitaremos cuando Unboks haya conectado y probado la integración.",
                                    )}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-2">
                                {showBadge && <DeliveryBadge status={status!} />}
                                <Switch
                                  checked={supported ? pref.enabled : false}
                                  onCheckedChange={(v) =>
                                    setNotifyDraft({
                                      ...notifyDraft,
                                      [row.key]: { ...pref, enabled: v },
                                    })
                                  }
                                  disabled={!supported || notifyLoading || notifySaving}
                                  aria-label={
                                    supported
                                      ? tenantText(
                                          `Enable ${row.label} alerts`,
                                          `Activar alertas de ${row.label}`,
                                        )
                                      : tenantText(
                                          `${row.label} alerts are coming soon`,
                                          `Las alertas de ${row.label} estarán disponibles próximamente`,
                                        )
                                  }
                                  className="data-[state=checked]:bg-[#1a73e8] data-[state=unchecked]:bg-[#dadce0]"
                                />
                              </div>
                            </div>
                            {supported && pref.enabled && (
                              <>
                                <TextInput
                                  type="text"
                                  value={pref.destination}
                                  onChange={(e) =>
                                    setNotifyDraft({
                                      ...notifyDraft,
                                      [row.key]: { ...pref, destination: e.target.value },
                                    })
                                  }
                                  placeholder={row.placeholder}
                                />
                                {row.key === "whatsapp" && (
                                  <p className="mt-1 text-[11px] text-[#5f6368]">
                                    {tenantText(
                                      "Include country code, for example +599 for Curaçao or +351 for Portugal.",
                                      "Incluye el prefijo del país; por ejemplo, +34 para España.",
                                    )}
                                  </p>
                                )}
                              </>
                            )}
                            {/* WhatsApp activation guidance. Only shown
                                when the operator has enabled WhatsApp
                                alerts, so we never lecture them about a
                                channel they didn't ask for. The longer
                                START-message instruction appears for
                                "pending activation"; the short
                                confirmation for "active". The business
                                number isn't hardcoded — it's part of the
                                Unboks setup the operator already knows. */}
                            {row.key === "whatsapp" && pref.enabled && status === "pending_activation" && (
                              <div className="mt-2 rounded-md border border-[#fde293] bg-[#fef7e0] px-3 py-2 text-[12px] text-[#7a5a00]">
                                {tenantText(
                                  "WhatsApp alerts are configured but not active yet. Send START from this operator WhatsApp number to the business WhatsApp number to activate alerts.",
                                  "Las alertas de WhatsApp están configuradas, pero aún no están activas. Envía START desde este número de WhatsApp del operador al número de WhatsApp de la empresa para activarlas.",
                                )}
                              </div>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "active" && (
                              <p className="mt-2 text-[12px] text-[#137333]">
                                {tenantText(
                                  "WhatsApp alerts are active.",
                                  "Las alertas de WhatsApp están activas.",
                                )}
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "not_configured" && (
                              <p className="mt-2 text-[12px] text-[#5f6368]">
                                {tenantText(
                                  "Add a WhatsApp number above to activate alerts.",
                                  "Añade arriba un número de WhatsApp para activar las alertas.",
                                )}
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "saved_only" && (
                              <p className="mt-2 text-[12px] text-[#5f6368]">
                                {tenantText(
                                  "Settings are saved but alerts are not sending yet. Contact your Unboks team if this does not update soon.",
                                  "La configuración está guardada, pero las alertas aún no se envían. Contacta con el equipo de Unboks si no se actualiza pronto.",
                                )}
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "provider_not_configured" && (
                              <p className="mt-2 text-[12px] text-[#5f6368]">
                                {tenantText(
                                  "Your Unboks team still needs to finish setup. No action needed on your end.",
                                  "El equipo de Unboks debe terminar la configuración. No tienes que hacer nada.",
                                )}
                              </p>
                            )}
                            {row.key === "whatsapp" && pref.enabled && status === "failed" && (
                              <p className="mt-2 text-[12px] text-[#a50e0e]">
                                {tenantText(
                                  "Recent delivery failed. Check the number or contact your Unboks team.",
                                  "El último envío ha fallado. Comprueba el número o contacta con el equipo de Unboks.",
                                )}
                              </p>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="mt-4 space-y-1 rounded-lg border border-[#e6e8eb] bg-[#fbfbfd] px-3 py-3 text-[11px] text-[#5f6368]">
                    <p className="font-medium text-[#3c4043]">
                      {tenantText("Status guide", "Guía de estados")}
                    </p>
                    <p>
                      <span className="font-medium text-[#137333]">
                        {tenantText("Active", "Activo")}
                      </span>
                      : {tenantText("alerts are being sent.", "las alertas se están enviando.")}
                    </p>
                    <p>
                      <span className="font-medium text-[#7a5a00]">
                        {tenantText("Pending activation", "Activación pendiente")}
                      </span>
                      : {tenantText(
                        "configured and saved. Send START from your WhatsApp to the business number to finish activating.",
                        "configurado y guardado. Envía START desde tu WhatsApp al número de la empresa para terminar la activación.",
                      )}
                    </p>
                    <p>
                      <span className="font-medium text-[#5f6368]">
                        {tenantText("Not yet sending", "Aún no envía")}
                      </span>
                      : {tenantText(
                        "settings are saved but no delivery yet. Contact your Unboks team if this persists.",
                        "la configuración está guardada, pero todavía no hay envíos. Contacta con el equipo de Unboks si continúa así.",
                      )}
                    </p>
                    <p>
                      <span className="font-medium text-[#7a5a00]">
                        {tenantText("Not yet connected", "Aún no conectado")}
                      </span>
                      : {tenantText(
                        "your Unboks team still needs to finish setup. No action needed on your end.",
                        "el equipo de Unboks debe terminar la configuración. No tienes que hacer nada.",
                      )}
                    </p>
                    <p>
                      <span className="font-medium text-[#a50e0e]">
                        {tenantText("Failed", "Fallido")}
                      </span>
                      : {tenantText(
                        "recent delivery failed. Check the number or contact your Unboks team.",
                        "el último envío ha fallado. Comprueba el número o contacta con el equipo de Unboks.",
                      )}
                    </p>
                  </div>
                </Card>
              )}

              {active === "data-retention" && (
                <div className="space-y-5">
                  {isAliRentalTenant() && <AliDossierRetentionSettings />}
                  <DataRetentionSettings />
                </div>
              )}

              {active === "blocked-senders" && (
                <div className="space-y-5">
                  <BlockedSendersList />
                </div>
              )}

              {active === "excluded-contacts" && (
                <div className="space-y-5">
                  <ExcludedContactsSettings />
                </div>
              )}

              {active === "auto-block" && (
                <div className="space-y-5">
                  <AutoBlockRulesSettings />
                  <BlockedSendersList />
                </div>
              )}

              {active === "agent-learnings" && (
                <div className="space-y-5">
                  <AgentLearningsList />
                </div>
              )}

              {active === "agent-personality" && (
                <div className="space-y-5">
                  <Card
                    title={tenantText("AI Agent identity", "Identidad del agente de IA")}
                    description={tenantText(
                      "Choose the name your AI assistant uses with customers.",
                      "Elige el nombre que usa el asistente de IA con las personas interesadas.",
                    )}
                    footer={
                      <>
                        <SavedFlash visible={agentNameSaved} />
                        <PrimaryButton
                          type="button"
                          disabled={!canSaveAgentName}
                          onClick={async () => {
                            if (!canSaveAgentName) return;
                            try {
                              await saveAgentName(normalizedAgentNameDraft);
                              setAgentNameSaved(true);
                              toast.success(
                                tenantText("AI Agent name saved.", "Nombre del agente de IA guardado."),
                              );
                            } catch (err) {
                              const msg = err instanceof Error && err.message
                                ? err.message
                                : tenantText(
                                    "Could not save AI Agent name.",
                                    "No se pudo guardar el nombre del agente de IA.",
                                  );
                              toast.error(msg);
                            }
                          }}
                        >
                          {tenantText("Save agent name", "Guardar nombre del agente")}
                        </PrimaryButton>
                      </>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label className="block">
                        <FieldLabel>
                          {tenantText("AI Agent name", "Nombre del agente de IA")}
                        </FieldLabel>
                        <TextInput
                          type="text"
                          maxLength={40}
                          value={agentNameDraft}
                          placeholder="Marina"
                          disabled={agentNameLoading || agentNameOverrideActive}
                          onChange={(e) => {
                            setAgentNameDraft(e.target.value);
                            setAgentNameSaved(false);
                          }}
                        />
                        <p className="mt-1 text-[12px] text-[#5f6368]">
                          {tenantText("Current active name", "Nombre activo")}:{" "}
                          <span className="font-medium text-[#202124]">
                            {agentNameSettings.effectiveName || "Marina"}
                          </span>
                          {agentNameOverrideActive && (
                            <span className="ml-2 rounded-full bg-[#fef7e0] px-2 py-0.5 text-[11px] font-medium text-[#7a5a00]">
                              {tenantText("Admin override active", "Anulación administrativa activa")}
                            </span>
                          )}
                        </p>
                        {agentNameError && !agentNameOverrideActive && (
                          <p className="mt-1 text-[12px] text-[#a50e0e]">{agentNameError}</p>
                        )}
                      </label>
                      <div className="text-[12px] leading-5 text-[#5f6368] sm:max-w-[360px]">
                        <p>
                          {tenantText(
                            "This is the display name, not the model/provider name.",
                            "Este es el nombre visible, no el nombre del modelo o proveedor.",
                          )}
                        </p>
                        <p>
                          {tenantText(
                            "Your assistant will not claim to be human or a licensed professional.",
                            "El asistente no afirmará ser una persona ni un profesional sanitario colegiado.",
                          )}
                        </p>
                        {agentNameOverrideActive && (
                          <p className="mt-2 rounded-lg bg-[#fef7e0] px-3 py-2 text-[#7a5a00]">
                            {tenantText(
                              "Admin override active. Contact Unboks to change this name.",
                              "Hay una anulación administrativa activa. Contacta con Unboks para cambiar este nombre.",
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                  <Card
                    title={tenantText("Response timing", "Tiempo de respuesta")}
                    description={tenantText(
                      "Wait briefly for quick follow-up messages, then reply once with the full context.",
                      "Espera brevemente por si llegan varios mensajes seguidos y responde una sola vez con todo el contexto.",
                    )}
                  >
                    {responseTimingLoading ? (
                      <p className="text-[13px] text-[#5f6368]">
                        {tenantText("Loading response timing…", "Cargando el tiempo de respuesta…")}
                      </p>
                    ) : responseTimingError || !responseTiming || !responseTimingTenant ? (
                      <p className="text-[13px] text-[#c5221f]">
                        {tenantText(
                          "Could not load response timing.",
                          "No se pudo cargar el tiempo de respuesta.",
                        )}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4 rounded-xl border border-[#edf0f3] bg-[#fbfcfe] px-4 py-3">
                          <div>
                            <p className="text-[13px] font-medium text-[#202124]">
                              {tenantText("Message batching", "Agrupación de mensajes")}
                            </p>
                            <p className="text-[12px] text-[#5f6368]">
                              {tenantText(
                                "Marina waits for quick consecutive WhatsApp messages before replying.",
                                "Marina espera brevemente por si llegan varios mensajes seguidos de WhatsApp antes de responder.",
                              )}
                            </p>
                          </div>
                          <Switch
                            checked={responseTimingTenant.message_batching_enabled}
                            disabled={saveResponseTiming.isPending || responseTimingOverrideActive}
                            onCheckedChange={async (checked) => {
                              try {
                                await saveResponseTiming.mutateAsync({
                                  ...responseTimingTenant,
                                  message_batching_enabled: checked,
                                });
                                toast.success(
                                  tenantText("Response timing saved.", "Tiempo de respuesta guardado."),
                                );
                              } catch (err) {
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : tenantText(
                                        "Could not save response timing.",
                                        "No se pudo guardar el tiempo de respuesta.",
                                      ),
                                );
                              }
                            }}
                            aria-label={tenantText(
                              "Message batching enabled",
                              "Agrupación de mensajes activada",
                            )}
                          />
                        </div>
                        <div>
                          <FieldLabel>
                            {tenantText("Timing mode", "Modo de espera")}
                          </FieldLabel>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            {[
                              {
                                key: "preset",
                                label: tenantText("Preset", "Predefinido"),
                                help: tenantText(
                                  "Fast, balanced, or patient.",
                                  "Rápido, equilibrado o pausado.",
                                ),
                              },
                              {
                                key: "custom",
                                label: tenantText("Custom", "Personalizado"),
                                help: tenantText(
                                  "Choose exact seconds.",
                                  "Elige los segundos exactos.",
                                ),
                              },
                              {
                                key: "random",
                                label: tenantText("Random", "Aleatorio"),
                                help: tenantText(
                                  "Random wait each batch.",
                                  "Espera aleatoria en cada grupo.",
                                ),
                              },
                            ].map((mode) => (
                              <button
                                key={mode.key}
                                type="button"
                                disabled={saveResponseTiming.isPending || responseTimingOverrideActive}
                                onClick={async () => {
                                  try {
                                    const next = {
                                      ...responseTimingTenant,
                                      mode: mode.key,
                                      ...(mode.key === "custom"
                                        ? {
                                            custom_delay_seconds:
                                              responseTimingTenant.custom_delay_seconds ?? responseTimingTenant.delay_seconds ?? 12,
                                          }
                                        : {}),
                                      ...(mode.key === "random"
                                        ? {
                                            random_min_seconds: responseTimingTenant.random_min_seconds ?? 5,
                                            random_max_seconds: responseTimingTenant.random_max_seconds ?? 25,
                                          }
                                        : {}),
                                    };
                                    await saveResponseTiming.mutateAsync(next);
                                    toast.success(
                                      tenantText("Response timing saved.", "Tiempo de respuesta guardado."),
                                    );
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : tenantText(
                                            "Could not save response timing.",
                                            "No se pudo guardar el tiempo de respuesta.",
                                          ),
                                    );
                                  }
                                }}
                                className={cn(
                                  "rounded-xl border px-4 py-3 text-left text-[13px] transition",
                                  responseTimingMode === mode.key
                                    ? "border-[#1a73e8] bg-[#e8f0fe] text-[#174ea6]"
                                    : "border-[#e8eaed] bg-white text-[#202124] hover:border-[#cbd5e1]",
                                  (saveResponseTiming.isPending || responseTimingOverrideActive) && "cursor-not-allowed opacity-60",
                                )}
                              >
                                <span className="block font-medium">{mode.label}</span>
                                <span className="text-[12px] text-[#5f6368]">{mode.help}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {responseTimingMode === "preset" && (
                        <div>
                          <FieldLabel>{tenantText("Reply speed", "Velocidad de respuesta")}</FieldLabel>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            {(responseTimingSettings?.presets ?? []).map((preset) => {
                              const selected = responseTimingTenant.preset === preset.key;
                              return (
                                <button
                                  key={preset.key}
                                  type="button"
                                  disabled={saveResponseTiming.isPending || responseTimingOverrideActive}
                                  onClick={async () => {
                                    try {
                                      await saveResponseTiming.mutateAsync({
                                        ...responseTimingTenant,
                                        mode: "preset",
                                        preset: preset.key,
                                        delay_seconds: preset.delay_seconds,
                                      });
                                      toast.success(
                                        tenantText("Response timing saved.", "Tiempo de respuesta guardado."),
                                      );
                                    } catch (err) {
                                      toast.error(
                                        err instanceof Error
                                          ? err.message
                                          : tenantText(
                                              "Could not save response timing.",
                                              "No se pudo guardar el tiempo de respuesta.",
                                            ),
                                      );
                                    }
                                  }}
                                  className={cn(
                                    "rounded-xl border px-4 py-3 text-left text-[13px] transition",
                                    selected
                                      ? "border-[#1a73e8] bg-[#e8f0fe] text-[#174ea6]"
                                      : "border-[#e8eaed] bg-white text-[#202124] hover:border-[#cbd5e1]",
                                    (saveResponseTiming.isPending || responseTimingOverrideActive) && "cursor-not-allowed opacity-60",
                                  )}
                                >
                                  <span className="block font-medium">
                                    {isSpainSpanishTenant()
                                      ? preset.key === "fast"
                                        ? "Rápido"
                                        : preset.key === "patient"
                                          ? "Pausado"
                                          : preset.key === "balanced"
                                            ? "Equilibrado"
                                            : preset.label
                                      : preset.label}
                                  </span>
                                  <span className="text-[12px] text-[#5f6368]">
                                    {tenantText("Waits about", "Espera unos")}{" "}
                                    {preset.delay_seconds} {tenantText("seconds.", "segundos.")}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        )}

                        {responseTimingMode === "custom" && (
                          <label className="block">
                            <FieldLabel>
                              {tenantText("Custom wait in seconds", "Espera personalizada en segundos")}
                            </FieldLabel>
                            <input
                              type="number"
                              min={5}
                              max={300}
                              step={1}
                              value={Math.round(responseTimingTenant.custom_delay_seconds ?? responseTimingTenant.delay_seconds ?? 12)}
                              disabled={saveResponseTiming.isPending || responseTimingOverrideActive}
                              onChange={async (event) => {
                                const value = Math.max(5, Math.min(300, Number(event.target.value) || 12));
                                try {
                                  await saveResponseTiming.mutateAsync({
                                    ...responseTimingTenant,
                                    mode: "custom",
                                    custom_delay_seconds: value,
                                    delay_seconds: value,
                                    max_wait_seconds: value,
                                  });
                                  toast.success(
                                    tenantText("Response timing saved.", "Tiempo de respuesta guardado."),
                                  );
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : tenantText(
                                          "Could not save response timing.",
                                          "No se pudo guardar el tiempo de respuesta.",
                                        ),
                                  );
                                }
                              }}
                              className="mt-2 h-11 w-full rounded-xl border border-[#dadce0] bg-white px-3 text-[14px] text-[#202124] outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/15 disabled:opacity-60"
                            />
                            <p className="mt-1 text-[12px] text-[#5f6368]">
                              {tenantText(
                                "Allowed range: 5 to 300 seconds.",
                                "Intervalo permitido: de 5 a 300 segundos.",
                              )}
                            </p>
                          </label>
                        )}

                        {responseTimingMode === "random" && (
                          <div className="rounded-xl border border-[#edf0f3] bg-[#fbfcfe] px-4 py-3">
                            <FieldLabel>
                              {tenantText("Random wait range", "Intervalo de espera aleatoria")}
                            </FieldLabel>
                            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                              {[
                                {
                                  key: "random_min_seconds",
                                  label: tenantText("Minimum", "Mínimo"),
                                  fallback: 5,
                                },
                                {
                                  key: "random_max_seconds",
                                  label: tenantText("Maximum", "Máximo"),
                                  fallback: 25,
                                },
                              ].map((field) => {
                                const value = Math.round(
                                  Number(responseTimingTenant[field.key as "random_min_seconds" | "random_max_seconds"] ?? field.fallback),
                                );
                                return (
                                  <label key={field.key} className="block">
                                    <span className="text-[12px] font-medium text-[#202124]">
                                      {field.label}: {value}s
                                    </span>
                                    <input
                                      type="range"
                                      min={5}
                                      max={300}
                                      step={1}
                                      value={value}
                                      disabled={saveResponseTiming.isPending || responseTimingOverrideActive}
                                      onChange={async (event) => {
                                        const nextValue = Math.max(5, Math.min(300, Number(event.target.value) || field.fallback));
                                        const next = {
                                          ...responseTimingTenant,
                                          mode: "random",
                                          random_min_seconds: responseTimingTenant.random_min_seconds ?? 5,
                                          random_max_seconds: responseTimingTenant.random_max_seconds ?? 25,
                                          [field.key]: nextValue,
                                        };
                                        if ((next.random_min_seconds ?? 5) > (next.random_max_seconds ?? 25)) {
                                          if (field.key === "random_min_seconds") next.random_max_seconds = nextValue;
                                          else next.random_min_seconds = nextValue;
                                        }
                                        try {
                                          await saveResponseTiming.mutateAsync(next);
                                          toast.success(
                                            tenantText("Response timing saved.", "Tiempo de respuesta guardado."),
                                          );
                                        } catch (err) {
                                          toast.error(
                                            err instanceof Error
                                              ? err.message
                                              : tenantText(
                                                  "Could not save response timing.",
                                                  "No se pudo guardar el tiempo de respuesta.",
                                                ),
                                          );
                                        }
                                      }}
                                      className="mt-2 w-full"
                                    />
                                  </label>
                                );
                              })}
                            </div>
                            <p className="mt-2 text-[12px] text-[#5f6368]">
                              {tenantText(
                                "Marina picks one random wait value inside this range for each new message batch.",
                                "Marina elige un tiempo de espera aleatorio dentro de este intervalo para cada nuevo grupo de mensajes.",
                              )}
                            </p>
                          </div>
                        )}
                        <div className="grid gap-3 text-[12px] text-[#5f6368] sm:grid-cols-2">
                          <p>
                            {tenantText("Current active timing", "Tiempo activo actual")}:{" "}
                            <span className="font-medium text-[#202124]">
                              {!responseTiming.message_batching_enabled
                                ? tenantText("Immediate replies", "Respuestas inmediatas")
                                : responseTiming.mode === "random"
                                  ? tenantText(
                                      `Random ${responseTiming.random_min_seconds}s-${responseTiming.random_max_seconds}s`,
                                      `Aleatorio ${responseTiming.random_min_seconds}s-${responseTiming.random_max_seconds}s`,
                                    )
                                  : tenantText(
                                      `${responseTiming.delay_seconds}s delay`,
                                      `${responseTiming.delay_seconds}s de espera`,
                                    )}
                            </span>
                          </p>
                          {responseTimingOverrideActive && (
                            <p className="rounded-lg bg-[#fef7e0] px-3 py-2 text-[#7a5a00]">
                              {tenantText(
                                "Admin override active. Contact Unboks to change this timing.",
                                "Hay una anulación administrativa activa. Contacta con Unboks para cambiar este tiempo.",
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                  <AgentPersonalityWizard />
                </div>
              )}

              {active === "preferences" && (
                <div className="space-y-5">
                  <Card
                    title={tenantText("Email replies", "Respuestas por correo")}
                    description={tenantText(
                      "Choose how email replies are opened from the inbox.",
                      "Elige cómo se abren las respuestas por correo desde la bandeja.",
                    )}
                  >
                    <div className="flex flex-wrap gap-2">
                      {(["gmail", "mailto"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setEmailClient(option)}
                          className={cn(
                            "rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors",
                            emailClient === option
                              ? "border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]"
                              : "border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f6f8fc]",
                          )}
                        >
                          {option === "gmail"
                            ? "Gmail"
                            : tenantText("Default mail app", "Aplicación de correo predeterminada")}
                        </button>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function WebsiteLinksCard({
  blocks,
  onSaveBlock,
  isSavingBlock,
  isLoading,
  loadError,
}: {
  blocks: SotBlock[];
  onSaveBlock: (block: SotBlock) => Promise<void>;
  isSavingBlock: boolean;
  isLoading: boolean;
  loadError: Error | null;
}) {
  const block = useMemo(() => getWebsiteLinksBlock(blocks), [blocks]);
  const links = block.items ?? [];
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const disabled = busy || isSavingBlock || isLoading || Boolean(loadError);

  const saveLinks = async (items: string[]) => {
    await onSaveBlock({
      ...block,
      items,
    });
  };

  const addLink = async () => {
    const normalized = normalizeWebsiteUrl(url);
    if (!normalized) {
      toast.error(tenantText(
        "Enter a valid website link.",
        "Introduce un enlace web válido.",
      ));
      return;
    }
    const duplicate = links.some(
      (item) => websiteLinkUrlFromItem(item).replace(/\/$/, "") === normalized.replace(/\/$/, ""),
    );
    if (duplicate) {
      toast.error(tenantText(
        "That link is already saved.",
        "Ese enlace ya está guardado.",
      ));
      return;
    }
    setBusy(true);
    try {
      await saveLinks([websiteLinkItem(label, normalized), ...links]);
      setUrl("");
      setLabel("");
      toast.success(tenantText(
        "Website link saved as a Source of Truth reference.",
        "Enlace web guardado como referencia de información.",
      ));
    } catch (err) {
      const msg = err instanceof Error && err.message
        ? err.message
        : tenantText(
            "Could not save website link.",
            "No se ha podido guardar el enlace web.",
          );
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (itemToRemove: string) => {
    setBusy(true);
    try {
      await saveLinks(links.filter((item) => item !== itemToRemove));
      toast.success(tenantText("Website link removed.", "Enlace web eliminado."));
    } catch (err) {
      const msg = err instanceof Error && err.message
        ? err.message
        : tenantText(
            "Could not remove website link.",
            "No se ha podido eliminar el enlace web.",
          );
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={tenantText("Website links", "Enlaces web")}
      description={tenantText(
        "Save important website pages as references. This does not crawl or import page content automatically.",
        "Guarda páginas web importantes como referencias. El contenido de las páginas no se importa automáticamente.",
      )}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[#dfe6f7] bg-[#f8fbff] px-3 py-2 text-[12px] leading-relaxed text-[#3c4043]">
          {tenantText(
            "Links are stored as Source of Truth references so your team and Agent know where information lives. To use exact website content in replies, add the important text as knowledge or upload a file.",
            "Los enlaces se guardan como referencias para que el equipo y el agente sepan dónde encontrar la información. Para usar contenido exacto de una web en las respuestas, añade el texto importante como conocimiento o sube un archivo.",
          )}
        </div>

        {loadError && (
          <div
            role="alert"
            className="rounded-md border border-[#f6caca] bg-[#fce8e6] px-3 py-2 text-[12px] leading-relaxed text-[#a50e0e]"
          >
            {tenantText(
              "Could not load Source of Truth:",
              "No se ha podido cargar la información de referencia:",
            )} {loadError.message}. {tenantText("Refresh to retry.", "Actualiza para volver a intentarlo.")}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.3fr_auto] sm:items-end">
          <label className="block">
            <FieldLabel>{tenantText("Label optional", "Etiqueta opcional")}</FieldLabel>
            <TextInput
              type="text"
              value={label}
              disabled={disabled}
              placeholder={tenantText("Pricing, FAQ, menu", "Precios, preguntas frecuentes, servicios")}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="block">
            <FieldLabel>{tenantText("Website page link", "Enlace de la página web")}</FieldLabel>
            <TextInput
              type="url"
              value={url}
              disabled={disabled}
              placeholder="https://ejemplo.es/precios"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <PrimaryButton
            type="button"
            disabled={disabled || !url.trim()}
            onClick={addLink}
            className="inline-flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {tenantText("Add link", "Añadir enlace")}
          </PrimaryButton>
        </div>

        {isLoading ? (
          <p className="text-[13px] text-[#9aa0a6]">
            {tenantText("Loading website links...", "Cargando enlaces web...")}
          </p>
        ) : links.length === 0 ? (
          <p className="text-[13px] text-[#9aa0a6]">
            {tenantText(
              "No website references added yet.",
              "Aún no se han añadido referencias web.",
            )}
          </p>
        ) : (
          <ul className="divide-y divide-[#eef0f3] rounded-xl border border-[#e8eaed]">
            {links.map((item) => {
              const linkUrl = websiteLinkUrlFromItem(item);
              return (
                <li key={item} className="flex items-center gap-3 px-3 py-2.5">
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-[13px] text-[#1a73e8] hover:underline"
                  >
                    {item}
                  </a>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeLink(item)}
                    aria-label={tenantText("Remove website link", "Eliminar enlace web")}
                    className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ---------- Collapsible editable knowledge from sot.ts ----------

function YourInfoKnowledge({
  blocks,
  onSaveBlock,
  isSavingBlock,
  isLoading,
  loadError,
}: {
  blocks: SotBlock[];
  onSaveBlock: (block: SotBlock) => Promise<void>;
  isSavingBlock: boolean;
  isLoading: boolean;
  loadError: Error | null;
}) {
  const [open, setOpen] = useState(false);
  const starterBlock: SotBlock = {
    id: "business-knowledge",
    title: tenantText("Business knowledge", "Conocimiento de la clínica"),
    content: "",
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"
      >
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-[#202124]">
            {tenantText("Your Agent knowledge", "Conocimiento del agente")}
          </h3>
          <p className="mt-0.5 text-[13px] text-[#5f6368]">
            {tenantText(
              "Review and update the business information your Agent uses when replying to customers.",
              "Revisa y actualiza la información de la clínica que utiliza el agente al responder a las personas interesadas.",
            )}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-[#5f6368] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#f1f3f4] px-5 py-5 sm:px-6">
          {/* Sync status. SOT lives on the backend now (PUT /source-of-truth);
              every save is the canonical value for the whole workspace, so
              we tell the operator exactly that. Saving... shows while a
              PUT is in flight. A load error is surfaced verbatim so the
              operator knows the panel is read-only until it recovers. */}
          {loadError ? (
            <div
              role="alert"
              className="rounded-md border border-[#f6caca] bg-[#fce8e6] px-3 py-2 text-[12px] leading-relaxed text-[#a50e0e]"
            >
              {tenantText(
                "Could not load your Agent knowledge from the server:",
                "No se ha podido cargar el conocimiento del agente desde el servidor:",
              )} {loadError.message}. {tenantText("Refresh to retry.", "Actualiza para volver a intentarlo.")}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[12px] leading-relaxed text-[#5f6368]">
              {isSavingBlock ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1a73e8]" />
                  <span>{tenantText("Saving...", "Guardando...")}</span>
                </>
              ) : (
                <span>{tenantText(
                  "Synced across your workspace.",
                  "Sincronizado en todo el espacio de trabajo.",
                )}</span>
              )}
            </div>
          )}

          {isLoading ? (
            <p className="text-[13px] text-[#9aa0a6]">
              {tenantText(
                "Loading your Agent knowledge...",
                "Cargando el conocimiento del agente...",
              )}
            </p>
          ) : blocks.length === 0 ? (
            <>
              <div className="rounded-xl border border-[#e8eaed] bg-[#f8fafd] px-4 py-3 text-[13px] leading-relaxed text-[#5f6368]">
                {tenantText(
                  "Add the facts your Agent should use: services, products, prices, locations, policies, FAQs, and rules. These details are used in live replies after saving.",
                  "Añade la información que debe utilizar el agente: servicios, precios, centros, políticas, preguntas frecuentes y normas. Estos datos se usan en las respuestas en directo después de guardarlos.",
                )}
              </div>
              <SotKnowledgeCard
                block={starterBlock}
                onSave={onSaveBlock}
                isSavingExternal={isSavingBlock}
              />
            </>
          ) : (
            blocks.map((block) => (
              <SotKnowledgeCard
                key={block.id}
                block={block}
                onSave={onSaveBlock}
                isSavingExternal={isSavingBlock}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
