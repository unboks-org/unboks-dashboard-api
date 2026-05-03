import { useEffect } from "react";
import {
  Inbox as InboxIcon,
  Star,
  Clock,
  ChevronRight,
  Send,
  CalendarClock,
  Outdent,
  FileText,
  Mail,
  AlertOctagon,
  Trash2,
  Pencil,
  Circle,
  ChevronUp,
  Layers,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  active: string;
  onSelect: (id: string) => void;
  inboxCount: number;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number | string;
}

const PRIMARY: NavItem[] = [
  { id: "all", icon: Layers, label: "All inboxes", count: 17 },
  { id: "inbox", icon: InboxIcon, label: "Inbox" },
];

const SECONDARY: NavItem[] = [
  { id: "starred", icon: Star, label: "Starred" },
  { id: "snoozed", icon: Clock, label: "Snoozed" },
  { id: "important", icon: ChevronRight, label: "Important", count: "99+" },
  { id: "sent", icon: Send, label: "Sent" },
  { id: "scheduled", icon: CalendarClock, label: "Scheduled" },
  { id: "outbox", icon: Outdent, label: "Outbox" },
  { id: "drafts", icon: FileText, label: "Drafts", count: 2 },
  { id: "allmail", icon: Mail, label: "All mail" },
  { id: "spam", icon: AlertOctagon, label: "Spam" },
  { id: "trash", icon: Trash2, label: "Trash" },
];

export function Drawer({ open, onClose, active, onSelect, inboxCount }: DrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-label="Navigation"
        aria-hidden={!open}
        className={cn(
          "fixed top-0 left-0 h-full w-[300px] max-w-[85vw] bg-white z-50 shadow-xl flex flex-col transform transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-[#f1f3f4]">
          <div className="w-7 h-7 bg-[#1a73e8] rounded-md flex items-center justify-center">
            <Package className="w-4 h-4 text-white" />
          </div>
          <span className="text-[20px] text-[#5f6368] font-normal">Unboks</span>
        </div>

        {/* Active status */}
        <button
          onClick={() => onSelect("active")}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#f6f8fc] transition-colors"
        >
          <div className="flex items-center gap-4">
            <Circle className="w-3 h-3 text-[#34a853]" fill="currentColor" />
            <span className="text-[14px] text-[#202124] font-medium">Active</span>
          </div>
          <ChevronUp className="w-4 h-4 text-[#5f6368]" />
        </button>

        <div className="flex items-center gap-4 px-5 py-3 border-t border-b border-[#f1f3f4] hover:bg-[#f6f8fc] cursor-pointer">
          <Pencil className="w-4 h-4 text-[#5f6368]" strokeWidth={1.75} />
          <span className="text-[14px] text-[#202124]">Add a status</span>
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto py-2">
          {PRIMARY.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={active === item.id}
              count={item.id === "inbox" ? inboxCount : item.count}
              onSelect={onSelect}
            />
          ))}

          <div className="h-px bg-[#f1f3f4] my-2" />

          {SECONDARY.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              active={active === item.id}
              count={item.count}
              onSelect={onSelect}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}

function NavRow({
  item,
  active,
  count,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  count?: number | string;
  onSelect: (id: string) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        "w-full flex items-center gap-5 pl-5 pr-4 h-12 rounded-r-full text-[14px] transition-colors",
        active
          ? "bg-[#fce8e6] text-[#d93025] font-semibold"
          : "text-[#202124] hover:bg-[#f6f8fc]"
      )}
    >
      <Icon className={cn("w-5 h-5", active ? "text-[#d93025]" : "text-[#5f6368]")} strokeWidth={1.75} />
      <span className="flex-1 text-left">{item.label}</span>
      {count !== undefined && count !== 0 && (
        <span
          className={cn(
            "text-[12px]",
            active ? "text-[#d93025] font-semibold" : "text-[#5f6368]"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
