import { Search, Bell, LogOut } from "lucide-react";
import { format } from "date-fns";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ searchQuery, onSearchChange }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-between px-3 sm:px-4 gap-3 flex-shrink-0">
      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
        <h1 className="text-[16px] font-semibold text-foreground flex-shrink-0">Inbox</h1>
        
        <div className="max-w-md w-full relative group min-w-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages..."
            className="w-full bg-muted/40 border border-border/60 hover:border-border focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary rounded-md pl-9 pr-3 py-1.5 text-sm placeholder:text-muted-foreground transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
        <span className="hidden md:inline text-[13px] text-muted-foreground font-medium">
          {format(new Date(), "MMM d, yyyy")}
        </span>
        <div className="flex items-center gap-3">
          <button aria-label="Notifications" className="text-muted-foreground hover:text-foreground transition-colors relative">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full border border-white"></span>
          </button>
          <button aria-label="Sign out" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <LogOut className="w-4 h-4" />
            <span className="text-[13px] font-medium hidden sm:inline-block">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
