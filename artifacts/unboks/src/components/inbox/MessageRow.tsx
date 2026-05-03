import { Conversation } from "@/data/conversations";
import { cn } from "@/lib/utils";
import { 
  Square, 
  CheckSquare, 
  Mail, 
  MessageCircle, 
  Instagram, 
  Facebook, 
  Video, 
  MessageSquare,
  AlertCircle,
  Paperclip
} from "lucide-react";

// X Logo component
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const CHANNEL_ICONS = {
  Email: Mail,
  WhatsApp: MessageCircle,
  Instagram: Instagram,
  Facebook: Facebook,
  X: XIcon,
  TikTok: Video,
  Messenger: MessageSquare,
  All: Mail // Fallback
};

interface MessageRowProps {
  conversation: Conversation;
  isSelected: boolean;
  onToggleSelect: () => void;
}

export function MessageRow({ conversation, isSelected, onToggleSelect }: MessageRowProps) {
  const Icon = CHANNEL_ICONS[conversation.channel] || Mail;

  return (
    <div 
      className={cn(
        "group h-11 flex items-center px-3 border-b border-border/40 text-[14px] transition-colors cursor-pointer",
        isSelected ? "bg-primary/5 hover:bg-primary/10" : "bg-white hover:bg-muted/30",
        conversation.unread ? "font-semibold text-foreground" : "font-normal text-muted-foreground"
      )}
      onClick={onToggleSelect}
    >
      <div className="flex items-center gap-3 w-48 flex-shrink-0">
        <button 
          className="text-muted-foreground/50 hover:text-foreground group-hover:text-muted-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        >
          {isSelected ? (
            <CheckSquare className="w-[15px] h-[15px] text-primary" />
          ) : (
            <Square className="w-[15px] h-[15px]" />
          )}
        </button>
        
        <div className="flex items-center gap-2 overflow-hidden">
          <Icon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/70" />
          <span className="truncate" title={conversation.sender}>
            {conversation.sender}
          </span>
        </div>
      </div>

      <div className="flex-1 flex items-center gap-2 min-w-0 pr-4">
        {conversation.escalated && (
          <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
        )}
        <span className={cn("truncate max-w-[200px] flex-shrink-0", !conversation.unread && "text-foreground")}>
          {conversation.subject}
        </span>
        <span className="text-muted-foreground/60 flex-shrink-0 font-normal">—</span>
        <span className="truncate text-muted-foreground font-normal">
          {conversation.preview}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 text-[12px] font-normal">
        {conversation.hasAttachment && (
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground/70" />
        )}
        <span className="w-16 text-right whitespace-nowrap">
          {conversation.timestamp}
        </span>
      </div>
    </div>
  );
}
