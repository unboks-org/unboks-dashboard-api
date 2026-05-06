import { useEffect } from "react";
import { useEnabledChannels } from "@/hooks/use-enabled-channels";
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
  MessageSquare,
  Circle,
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
}: DrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const PRIMARY: NavItem[] = [
    { id: "inbox", icon: InboxIcon, label: "Inbox", count: inboxCount },
    { id: "escalations", icon: AlertCircle, label: "Escalations", count: escalationsCount },
  ];

  const { isChannelEnabled } = useEnabledChannels();

  const ALL_CHANNELS: NavItem[] = [
    { id: "channel:WhatsApp", icon: MessageCircle, label: "WhatsApp", count: channelCounts.WhatsApp },
    { id: "channel:Email", icon: Mail, label: "Email", count: channelCounts.Email },
    { id: "channel:Instagram", icon: Instagram, label: "Instagram", count: channelCounts.Instagram },
    { id: "channel:Facebook", icon: Facebook, label: "Facebook", count: channelCounts.Facebook },
    { id: "channel:X", icon: XIcon, label: "X", count: channelCounts.X },
    { id: "channel:TikTok", icon: Video, label: "TikTok", count: channelCounts.TikTok },
    { id: "channel:Messenger", icon: MessageSquare, label: "Messenger", count: channelCounts.Messenger },
  ];

  const CHANNELS = ALL_CHANNELS.filter((item) => {
    const ch = item.id.split(":")[1];
    return isChannelEnabled(ch as Parameters<typeof isChannelEnabled>[0]);
  });

  const FOOTER: NavItem[] = [
    { id: "bookings", icon: Calendar, label: "Bookings" },
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
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Drawer panel: fixed overlay on mobile, static sidebar on md+ */}
      <aside
        aria-label="Navigation"
        className={cn(
          "bg-white flex flex-col",
          // Mobile (default): fixed overlay
          "fixed top-0 left-0 h-full w-[300px] max-w-[85vw] z-50 shadow-xl transform transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop (md+): static sidebar always visible
          "md:static md:h-auto md:translate-x-0 md:w-72 md:max-w-none md:shadow-none md:border-r md:border-[#f1f3f4] md:flex-shrink-0 md:z-auto"
        )}
      >
        {/* Brand */}
        <div className="px-5 py-4 flex items-center border-b border-[#f1f3f4]">
          <img
            src="/unboks-logo.png"
            alt="Unboks"
            className="h-11 w-auto object-contain object-left"
            draggable={false}
          />
        </div>

        {/* Operational heartbeat */}
        <div className="px-5 py-3 border-b border-[#f1f3f4]">
          <div className="flex items-center gap-2 mb-1.5">
            <Circle className="w-2.5 h-2.5 text-[#34a853] flex-shrink-0" fill="currentColor" />
            <span className="text-[14px] text-[#202124] font-medium">Active</span>
          </div>
          <p className="text-[12px] text-[#5f6368] pl-[18px]">Connected to Unboks</p>
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto py-2">
          {PRIMARY.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={active === item.id}
              onSelect={onSelect}
            />
          ))}

          <SectionHeader label="Channels" />

          {CHANNELS.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={active === item.id}
              onSelect={onSelect}
            />
          ))}

          <div className="h-px bg-[#f1f3f4] my-2" />

          {FOOTER.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={active === item.id}
              onSelect={onSelect}
            />
          ))}
        </nav>

        {onLogout && (
          <div className="border-t border-[#f1f3f4] p-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-5 pl-5 pr-4 h-12 rounded-r-full text-[14px] text-[#202124] hover:bg-[#f6f8fc] transition-colors"
            >
              <LogOut className="w-5 h-5 text-[#5f6368]" strokeWidth={1.75} />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 pt-4 pb-2 text-[12px] font-medium uppercase tracking-wider text-[#5f6368]">
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
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        "w-full flex items-center gap-5 pl-5 pr-4 h-12 rounded-r-full text-[14px] transition-colors",
        active
          ? "bg-[#e8f0fe] text-[#1a73e8] font-semibold"
          : "text-[#202124] hover:bg-[#f6f8fc]"
      )}
    >
      <Icon
        className={cn("w-5 h-5", active ? "text-[#1a73e8]" : "text-[#5f6368]")}
        strokeWidth={1.75}
      />
      <span className="flex-1 text-left">{item.label}</span>
      {item.count !== undefined && item.count > 0 && (
        <span
          className={cn(
            "text-[12px]",
            active ? "text-[#1a73e8] font-semibold" : "text-[#5f6368]"
          )}
        >
          {item.count}
        </span>
      )}
    </button>
  );
}
