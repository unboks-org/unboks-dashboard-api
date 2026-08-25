import { useEffect } from "react";
import { useIcpChannelVisibility } from "@/hooks/use-icp-channel-visibility";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import { useClientProfile } from "@/hooks/use-client-profile";
import { useAgentStatus, useSetAgentStatus } from "@/hooks/use-agent-status";
import type { AgentStatus, ClientProfile } from "@/lib/api";
import {
  Inbox as InboxIcon,
  AlertCircle,
  Calendar,
  Image as ImageIcon,
  Settings as SettingsIcon,
  BarChart2,
  BookOpen,
  Mail,
  MessageCircle,
  Instagram,
  Facebook,
  Video,
  Send,
  MessageSquare,
  LogOut,
  PhoneCall,
  Pause,
  Play,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "@/data/conversations";
import { motion, AnimatePresence } from "framer-motion";
import { getClientSlug } from "@/lib/tenant";
import { getTenantUiConfig, isAliRentalTenant, tenantText } from "@/lib/tenant-ui";

const XIcon = ({ className, strokeWidth: _sw }: { className?: string; strokeWidth?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export type NavId = "inbox" | "escalations" | "bookings" | "followups" | "images" | "settings" | "analytics" | "help" | `channel:${Channel}`;

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  active: NavId;
  onSelect: (id: NavId) => void;
  onLogout?: () => void;
  inboxCount: number;
  escalationsCount: number;
  channelCounts: Record<Channel, number>;
  appointmentsCount?: number;
}

interface NavItem {
  id: NavId;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
}

export function Drawer({
  open,
  onClose,
  active,
  onSelect,
  onLogout,
  inboxCount,
  escalationsCount,
  channelCounts,
  appointmentsCount = 0,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isDespertares = getClientSlug() === "consulta-despertares";
  const isRental = isAliRentalTenant();
  const ui = getTenantUiConfig();
  const PRIMARY: NavItem[] = isDespertares
    ? [
        { id: "inbox", icon: InboxIcon, label: ui.conversationsLabel, count: inboxCount },
      ]
    : [
        { id: "escalations", icon: AlertCircle, label: "Escalations", count: escalationsCount },
        { id: "inbox", icon: InboxIcon, label: "Inbox", count: inboxCount },
      ];

  const { isChannelVisible, bridgeUnavailable, bridgeUnavailableReason } =
    useIcpChannelVisibility();
  const { label: bookingsLabel } = useBookingsLabel();

  const ALL_CHANNELS: NavItem[] = [
    { id: "channel:WhatsApp", icon: MessageCircle, label: "WhatsApp", count: channelCounts.WhatsApp },
    { id: "channel:Email", icon: Mail, label: "Email", count: channelCounts.Email },
    { id: "channel:Instagram", icon: Instagram, label: "Instagram", count: channelCounts.Instagram },
    { id: "channel:Facebook", icon: Facebook, label: "Facebook", count: channelCounts.Facebook },
    { id: "channel:Messenger", icon: MessageSquare, label: "Messenger", count: channelCounts.Messenger },
    { id: "channel:Telegram", icon: Send, label: "Telegram", count: channelCounts.Telegram },
    { id: "channel:TikTok", icon: Video, label: "TikTok", count: channelCounts.TikTok },
    { id: "channel:X", icon: XIcon, label: "X", count: channelCounts.X },
  ];

  const CHANNELS = ALL_CHANNELS.filter((item) => {
    const ch = item.id.split(":")[1];
    return isChannelVisible(ch as Parameters<typeof isChannelVisible>[0]);
  });

  const WORKSPACE: NavItem[] = isDespertares || isRental
    ? [
        { id: "followups", icon: PhoneCall, label: ui.followUpsLabel },
        { id: "settings", icon: SettingsIcon, label: ui.settingsLabel },
      ]
    : [
        { id: "bookings", icon: Calendar, label: bookingsLabel, count: appointmentsCount },
        { id: "images", icon: ImageIcon, label: "Images" },
        { id: "analytics", icon: BarChart2, label: "Analytics" },
        { id: "help", icon: BookOpen, label: "Help" },
        { id: "settings", icon: SettingsIcon, label: "Settings" },
      ];

  const { data: profile } = useClientProfile();
  const agentStatus = useAgentStatus();
  const setAgentStatus = useSetAgentStatus();

  const content = (
    <div className="flex flex-col h-full bg-[#fbfbfd]">
      <WorkspaceBlock
        profile={profile}
        agentStatus={agentStatus.data}
        isAgentStatusLoading={agentStatus.isLoading}
        isAgentStatusUpdating={setAgentStatus.isPending}
        onToggleAgent={() => {
          if (agentStatus.data?.available) {
            setAgentStatus.mutate(!agentStatus.data.active);
          }
        }}
      />

      <nav className="flex-1 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavGroup>
          {PRIMARY.map((item) => (
            <NavRow key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
          ))}
        </NavGroup>

        {!isDespertares && <SectionHeader label="Channels" />}
        {!isDespertares && bridgeUnavailable && (
          <div className="mx-1 mb-2 rounded-xl border border-[#f6d48f] bg-[#fff8e1] px-3 py-2 text-[12px] leading-5 text-[#7a5a00]">
            ICP channel sync unavailable. Showing all channels until it reconnects.
            {bridgeUnavailableReason ? (
              <span className="block text-[#8a6d1d]">{bridgeUnavailableReason}</span>
            ) : null}
          </div>
        )}
        {!isDespertares && <NavGroup>
          {CHANNELS.map((item) => (
            <NavRow key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
          ))}
        </NavGroup>}

        <SectionHeader label={tenantText("Workspace", "Gestión")} />
        <NavGroup>
          {WORKSPACE.map((item) => (
            <NavRow key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
          ))}
        </NavGroup>
      </nav>

      {onLogout && (
        <div className="border-t border-border bg-card px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <motion.button
            onClick={onLogout}
            whileTap={{ scale: 0.98, opacity: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-[14px] text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
            <span className="font-medium">{tenantText("Sign out", "Cerrar sesión")}</span>
          </motion.button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile drawer */}
      <div className="md:hidden">
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                aria-hidden="true"
                onClick={onClose}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
              />
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 1 }}
                aria-label={tenantText("Navigation", "Navegación")}
                className="fixed top-0 left-0 h-full w-[300px] max-w-[85vw] z-50 shadow-2xl border-r border-border bg-background"
              >
                {content}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-[280px] md:flex-shrink-0 md:border-r md:border-border md:bg-background z-10">
        {content}
      </aside>
    </>
  );
}

/**
 * J3-N2-15: workspace identity block at the top of the sidebar. Refero
 * design language — calm monochrome, small status pill, no decorative
 * gradients. The business name is the source of truth Calvin asked for;
 * we surface the slug underneath as a quiet secondary line so an operator
 * who runs multiple tenants always knows which one is in front of them.
 *
 * `profile` may be undefined for the first paint (React Query hasn't
 * resolved yet); we render a neutral placeholder block at the same
 * dimensions so the sidebar doesn't reflow when the data arrives.
 */
function WorkspaceBlock({
  profile,
  agentStatus,
  isAgentStatusLoading,
  isAgentStatusUpdating,
  onToggleAgent,
}: {
  profile: ClientProfile | undefined;
  agentStatus: AgentStatus | undefined;
  isAgentStatusLoading: boolean;
  isAgentStatusUpdating: boolean;
  onToggleAgent: () => void;
}) {
  const name = profile?.name?.trim() || "";
  const slug = profile?.slug?.trim() || "";

  // Initials for the square avatar tile. Take the first letter of each
  // whitespace-separated token (max 2) so "Pepe Test" → "PT" and "Acme"
  // → "A". Falls back to "?" on an empty name to avoid an empty tile.
  const initials = (() => {
    const source = name || slug;
    if (!source) return "?";
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
    if (parts.length === 0) return "?";
    return parts.map((p) => p[0]!.toUpperCase()).join("");
  })();

  return (
    <div className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 border-b border-[#e6e8eb]">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="h-10 w-10 flex-shrink-0 rounded-xl bg-[#1f2937] text-white grid place-items-center text-[14px] font-semibold tracking-tight shadow-sm"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[#1f2937] leading-tight truncate">
            {name || tenantText("Workspace", "Espacio de trabajo")}
          </div>
          {slug && (
            <div className="text-[11.5px] text-[#5f6368] mt-0.5 truncate font-mono">
              {slug}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <AgentStatusBadge
          status={agentStatus}
          loading={isAgentStatusLoading}
        />
        <button
          type="button"
          onClick={onToggleAgent}
          disabled={
            isAgentStatusLoading ||
            isAgentStatusUpdating ||
            !agentStatus?.available
          }
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-semibold transition-colors",
            agentStatus?.active
              ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
            "disabled:cursor-not-allowed disabled:border-[#e6e8eb] disabled:bg-[#f5f6f7] disabled:text-[#9aa0a6]",
          )}
          aria-label={
            agentStatus?.active
              ? tenantText("Pause agent", "Pausar agente")
              : tenantText("Start agent", "Iniciar agente")
          }
        >
          {isAgentStatusUpdating || isAgentStatusLoading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : agentStatus?.active ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {agentStatus?.active
            ? tenantText("Pause agent", "Pausar agente")
            : tenantText("Start agent", "Iniciar agente")}
        </button>
      </div>
    </div>
  );
}

function AgentStatusBadge({
  status,
  loading,
}: {
  status: AgentStatus | undefined;
  loading: boolean;
}) {
  const s = loading
    ? { label: tenantText("Checking agent", "Comprobando agente"), dot: "#9aa0a6", text: "#5f6368", pulse: false }
    : !status?.available
      ? { label: tenantText("Agent unavailable", "Agente no disponible"), dot: "#9aa0a6", text: "#5f6368", pulse: false }
      : status.active
        ? { label: tenantText("Agent active", "Agente activo"), dot: "#10b981", text: "#1f2937", pulse: true }
        : { label: tenantText("Agent paused", "Agente pausado"), dot: "#f59e0b", text: "#1f2937", pulse: false };
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-[#e6e8eb] bg-card px-2.5 py-1 text-[11.5px] font-medium shadow-sm"
      role="status"
      aria-label={s.label}
    >
      <span className="relative grid h-1.5 w-1.5 place-items-center">
        {s.pulse && (
          <span
            aria-hidden="true"
            className="absolute inline-block h-1.5 w-1.5 rounded-full opacity-60 animate-ping"
            style={{ backgroundColor: s.dot }}
          />
        )}
        <span
          aria-hidden="true"
          className="relative inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: s.dot }}
        />
      </span>
      <span style={{ color: s.text }}>{s.label}</span>
    </div>
  );
}

function NavGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1">{children}</div>;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-6 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
  );
}

function NavRow({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (id: NavId) => void;
}) {
  const Icon = item.icon;
  const showCount = item.count !== undefined && item.count > 0;
  return (
    <motion.button
      whileTap={{ scale: 0.98, opacity: 0.9 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full flex items-center gap-3 pl-3 pr-2 h-10 rounded-xl text-[14px] transition-colors relative group",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground hover:bg-muted",
      )}
    >
      <Icon
        className={cn("w-[18px] h-[18px] flex-shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
        strokeWidth={active ? 2 : 1.75}
      />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {showCount && (
        <span
          className={cn(
            "min-w-[24px] h-[22px] px-1.5 inline-flex items-center justify-center rounded-full text-[11.5px] font-semibold tracking-tight transition-colors shadow-sm",
            active
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/10 text-foreground border border-border/50",
          )}
        >
          {item.count}
        </span>
      )}
    </motion.button>
  );
}
