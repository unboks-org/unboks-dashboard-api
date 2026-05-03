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
    <nav className="h-16 bg-[#f6f8fc] border-t border-[#e8eaed] flex items-center justify-around flex-shrink-0">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        const badge = item.id === "mail" ? mailBadge : item.id === "chat" ? chatBadge : 0;

        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            aria-label={item.label}
            className="relative flex flex-col items-center justify-center gap-1 px-6 py-2"
          >
            <span
              className={cn(
                "relative h-8 px-5 rounded-full flex items-center justify-center transition-colors",
                isActive ? "bg-[#c2e7ff]" : "bg-transparent"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5",
                  isActive ? "text-[#001d35]" : "text-[#5f6368]"
                )}
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#d93025] text-white text-[11px] font-medium rounded-full flex items-center justify-center border-2 border-[#f6f8fc]">
                  {badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
