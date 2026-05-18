import { Mail, MessageSquare, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  active: string;
  onChange: (id: string) => void;
  mailBadge?: number;
  chatBadge?: number;
}

const ITEMS = [
  { id: "mail", label: "Mail", icon: Mail },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "meet", label: "Meet", icon: Video },
];

export function BottomNav({ active, onChange, mailBadge = 0, chatBadge = 0 }: BottomNavProps) {
  return (
    <nav className="h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-white border-t border-[#e6e8eb] flex items-center justify-around flex-shrink-0 shadow-[0_-1px_10px_rgba(0,0,0,0.02)]">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        const badge = item.id === "mail" ? mailBadge : item.id === "chat" ? chatBadge : 0;

        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            aria-label={item.label}
            className="relative flex flex-col items-center justify-center gap-1 px-4 py-2 w-full active:scale-95 active:opacity-80 transition-all duration-200"
          >
            <span
              className={cn(
                "relative h-8 px-5 rounded-full flex items-center justify-center transition-all duration-300",
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
