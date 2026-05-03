import { 
  CheckSquare, 
  Square,
  ChevronDown, 
  RefreshCw, 
  Archive, 
  Mail, 
  MailOpen, 
  MoreHorizontal 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
  onArchive?: () => void;
}

export function Toolbar({ 
  selectedCount, 
  totalCount,
  onSelectAll,
  onDeselectAll,
  onMarkRead,
  onMarkUnread,
  onArchive
}: ToolbarProps) {
  const isAllSelected = selectedCount > 0 && selectedCount === totalCount;
  const isSomeSelected = selectedCount > 0 && selectedCount < totalCount;

  return (
    <div className="h-10 bg-white border-b border-border flex items-center justify-between px-3 flex-shrink-0">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0 mr-2">
          <button 
            onClick={isAllSelected || isSomeSelected ? onDeselectAll : onSelectAll}
            aria-label={isAllSelected || isSomeSelected ? "Deselect all" : "Select all"}
            className="p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded flex items-center justify-center transition-colors"
          >
            {isAllSelected ? (
              <CheckSquare className="w-[15px] h-[15px] text-primary" />
            ) : isSomeSelected ? (
              <div className="w-[15px] h-[15px] border border-muted-foreground rounded-[3px] bg-primary/10 flex items-center justify-center">
                 <div className="w-2 h-0.5 bg-primary rounded-sm" />
              </div>
            ) : (
              <Square className="w-[15px] h-[15px]" />
            )}
          </button>
          <button aria-label="Selection options" className="p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded flex items-center justify-center transition-colors">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        <button aria-label="Refresh" className="p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded flex items-center justify-center transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>

        {selectedCount > 0 && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            
            <button 
              onClick={onArchive}
              aria-label="Archive"
              className="p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded flex items-center justify-center transition-colors" 
              title="Archive"
            >
              <Archive className="w-4 h-4" />
            </button>
            <button 
              onClick={onMarkRead}
              aria-label="Mark as read"
              className="p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded flex items-center justify-center transition-colors" 
              title="Mark as read"
            >
              <MailOpen className="w-4 h-4" />
            </button>
            <button 
              onClick={onMarkUnread}
              aria-label="Mark as unread"
              className="p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded flex items-center justify-center transition-colors" 
              title="Mark as unread"
            >
              <Mail className="w-4 h-4" />
            </button>
            <button aria-label="More actions" className="p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded flex items-center justify-center transition-colors" title="More">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center">
        <span className="text-[12px] text-muted-foreground">
          {totalCount > 0 ? `1–${totalCount} of ${totalCount}` : "0 of 0"}
        </span>
      </div>
    </div>
  );
}
