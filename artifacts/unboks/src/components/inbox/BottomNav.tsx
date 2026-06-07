import { Calendar, Image as ImageIcon, Inbox, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavId } from "@/components/inbox/Drawer";
import { useBookingsLabel } from "@/hooks/use-bookings-label";

interface BottomNavProps {
  active: NavId;
  onChange: (id: NavId) => void;
  inboxBadge?: number;
  appointmentsBadge?: number;
}

function activeBottomId(active: NavId): NavId {
  if (active === "bookings" || active === "images" || active === "settings") return active;
  return "inbox";
}

export function BottomNav({
  active,
  onChange,
  inboxBadge = 0,
  appointmentsBadge = 0,
}: BottomNavProps) {
  const bottomActive = activeBottomId(active);
  const { label: bookingsLabel } = useBookingsLabel();
  const items = [
    { id: "inbox" as const, label: "Inbox", icon: Inbox },
    { id: "bookings" as const, label: bookingsLabel, icon: Calendar },
    { id: "images" as const, label: "Images", icon: ImageIcon },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ] satisfies { id: NavId; label: string; icon: typeof Inbox }[];
  return (
    <nav
      aria-label="Primary mobile navigation"
      className="h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white border-t border-[#e6e8eb] flex items-center justify-around flex-shrink-0 shadow-[0_-1px_10px_rgba(0,0,0,0.02)] md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = bottomActive === item.id;
        const badge =
          item.id === "inbox"
            ? inboxBadge
            : item.id === "bookings"
              ? appointmentsBadge
              : 0;

        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className="relative flex min-h-[44px] flex-col items-center justify-center gap-1 px-3 py-2 w-full active:scale-95 active:opacity-80 transition-all duration-200"
          >
            <span
              className={cn(
                "relative min-h-[32px] px-4 rounded-full flex items-center justify-center transition-all duration-300",
                isActive ? "bg-[#e8f0fe]" : "bg-transparent"
              )}
            >
              <Icon
                className={cn(
                  "w-[22px] h-[22px] transition-colors",
                  isActive ? "text-[#1a73e8]" : "text-[#5f6368]"
                )}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#dc2626] text-white text-[11px] font-medium rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  {badge}
                </span>
              )}
            </span>
            <span className={cn("text-[10px] font-medium", isActive ? "text-[#1f2937]" : "text-[#5f6368]")}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
