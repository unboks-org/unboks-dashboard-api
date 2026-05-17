import { useEffect } from "react";
import { useIcpChannelVisibility } from "@/hooks/use-icp-channel-visibility";
import { useBookingsLabel } from "@/hooks/use-bookings-label";
import {
  Inbox as InboxIcon,
  AlertCircle,
  Calendar,
  Settings as SettingsIcon,
  BarChart2,
  Mail,
  MessageCircle,
  Instagram,
  Facebook,
  Video,
  Send,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "@/data/conversations";

// X glyph (not Twitter bird)
const XIcon = ({ className, strokeWidth: _sw }: { className?: string; strokeWidth?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export type NavId =
  | "inbox"
  | "escalations"
  | "bookings"
  | "settings"
  | "analytics"
  | `channel:${Channel}`;

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  active: NavId;
  onSelect: (id: NavId) => void;
  onLogout?: () => void;
  inboxCount: number;
  escalationsCount: number;
  channelCounts: Record<Channel, number>;
  /**
   * Active appointment count (confirmed + pending team confirmation +
   * detected). Same source the Appointments page uses, so the badge and
   * the rendered list can never disagree. 0 hides the badge.
   */
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
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Escalations comes first: it's the most urgent operator function
  // (an escalation needs human attention now, an inbox can wait).
  const PRIMARY: NavItem[] = [
    { id: "escalations", icon: AlertCircle, label: "Escalations", count: escalationsCount },
    { id: "inbox", icon: InboxIcon, label: "Inbox", count: inboxCount },
  ];

  const { isChannelVisible } = useIcpChannelVisibility();
  const { label: bookingsLabel } = useBookingsLabel();

  const ALL_CHANNELS: NavItem[] = [
    { id: "channel:WhatsApp", icon: MessageCircle, label: "WhatsApp", count: channelCounts.WhatsApp },
    { id: "channel:Email", icon: Mail, label: "Email", count: channelCounts.Email },
    { id: "channel:Instagram", icon: Instagram, label: "Instagram", count: channelCounts.Instagram },
    { id: "channel:Facebook", icon: Facebook, label: "Facebook", count: channelCounts.Facebook },
    { id: "channel:Telegram", icon: Send, label: "Telegram", count: channelCounts.Telegram },
    { id: "channel:TikTok", icon: Video, label: "TikTok", count: channelCounts.TikTok },
    { id: "channel:X", icon: XIcon, label: "X", count: channelCounts.X },
  ];

  const CHANNELS = ALL_CHANNELS.filter((item) => {
    const ch = item.id.split(":")[1];
    return isChannelVisible(ch as Parameters<typeof isChannelVisible>[0]);
  });

  const WORKSPACE: NavItem[] = [
    { id: "bookings", icon: Calendar, label: bookingsLabel, count: appointmentsCount },
    { id: "analytics", icon: BarChart2, label: "Analytics" },
    { id: "settings", icon: SettingsIcon, label: "Settings" },
  ];

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity md:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Drawer panel: fixed overlay on mobile, static sidebar on md+ */}
      <aside
        aria-label="Navigation"
        className={cn(
          "flex flex-col bg-[#f8fafc]",
          // Mobile (default): fixed overlay
          "fixed top-0 left-0 h-full w-[296px] max-w-[85vw] z-50 shadow-xl transform transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop (md+): static sidebar always visible
          "md:static md:h-auto md:translate-x-0 md:w-[260px] md:max-w-none md:shadow-none md:border-r md:border-[#e5e7eb] md:flex-shrink-0 md:z-auto",
        )}
      >
        {/* Operational status pill — sits at the top of the sidebar now
             that the brand/header block has been removed (top padding
             absorbs the former brand block's space). */}
        <div className="px-4 pt-4 pb-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d6e9dc] bg-[#ecf6ee] px-2.5 py-1 text-[12px] font-medium text-[#137333]">
            <span className="relative grid h-1.5 w-1.5 place-items-center">
              <span className="absolute inline-block h-1.5 w-1.5 rounded-full bg-[#34a853] opacity-60 animate-ping" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[#34a853]" />
            </span>
            Active
            <span className="text-[#137333]/60" aria-hidden>·</span>
            <span className="font-normal text-[#1f6b35]">Connected to Unboks</span>
          </div>
        </div>

        {/* Nav list */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto px-2 pt-1 pb-3",
            // Subtle, non-harsh scrollbar
            "[scrollbar-width:thin] [scrollbar-color:#d9dee7_transparent]",
            "[&::-webkit-scrollbar]:w-1.5",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-[#e5e7eb]",
            "hover:[&::-webkit-scrollbar-thumb]:bg-[#d9dee7]",
          )}
        >
          <NavGroup>
            {PRIMARY.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={active === item.id}
                onSelect={onSelect}
              />
            ))}
          </NavGroup>

          <SectionHeader label="Channels" />
          <NavGroup>
            {CHANNELS.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={active === item.id}
                onSelect={onSelect}
              />
            ))}
          </NavGroup>

          <SectionHeader label="Workspace" />
          <NavGroup>
            {WORKSPACE.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={active === item.id}
                onSelect={onSelect}
              />
            ))}
          </NavGroup>
        </nav>

        {/* Footer / sign out */}
        {onLogout && (
          <div className="border-t border-[#e5e7eb] bg-white px-2 py-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13.5px] text-[#1f2937] hover:bg-[#eef1f6] transition-colors"
            >
              <LogOut className="w-4 h-4 text-[#6b7280]" strokeWidth={1.75} />
              <span className="font-medium">Sign out</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function NavGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-0.5">{children}</div>;
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
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
    <button
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full flex items-center gap-3 pl-3 pr-2 h-9 rounded-[10px] text-[13.5px] transition-colors",
        active
          ? "bg-[#e8f0fe] text-[#1a73e8] font-semibold"
          : "text-[#1f2937] hover:bg-[#eef1f6]",
      )}
    >
      <Icon
        className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#1a73e8]" : "text-[#6b7280]")}
        strokeWidth={1.75}
      />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {showCount && (
        <span
          className={cn(
            "min-w-[22px] h-[20px] px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-semibold leading-none",
            active
              ? "bg-[#dbeafe] text-[#1a73e8]"
              : "bg-[#eef2f7] text-[#4b5563]",
          )}
        >
          {item.count}
        </span>
      )}
    </button>
  );
}
