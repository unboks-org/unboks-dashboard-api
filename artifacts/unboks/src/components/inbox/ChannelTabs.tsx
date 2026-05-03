import { Channel } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { Mail, MessageCircle, Instagram, Facebook, Video, MessageSquare } from "lucide-react";

// X Logo as a clean SVG component to avoid Twitter bird
const XIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
    aria-hidden="true"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const TABS: { id: Channel; label: string; icon?: any }[] = [
  { id: "All", label: "All" },
  { id: "WhatsApp", label: "WhatsApp", icon: MessageCircle },
  { id: "Email", label: "Email", icon: Mail },
  { id: "Instagram", label: "Instagram", icon: Instagram },
  { id: "Facebook", label: "Facebook", icon: Facebook },
  { id: "X", label: "X", icon: XIcon },
  { id: "TikTok", label: "TikTok", icon: Video },
  { id: "Messenger", label: "Messenger", icon: MessageSquare },
];

interface ChannelTabsProps {
  activeTab: Channel;
  onTabChange: (tab: Channel) => void;
  counts: Record<Channel, number>;
}

export function ChannelTabs({ activeTab, onTabChange, counts }: ChannelTabsProps) {
  return (
    <div className="h-10 bg-white border-b border-border flex items-center px-4 flex-shrink-0 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-6 h-full">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = counts[tab.id] || 0;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative h-full flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  "text-[11px] ml-0.5",
                  isActive ? "text-primary/70" : "text-muted-foreground/70"
                )}>
                  {count}
                </span>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-sm" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
