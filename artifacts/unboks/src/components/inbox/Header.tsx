import { Menu, Search, Sparkles } from "lucide-react";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenDrawer: () => void;
}

export function Header({ searchQuery, onSearchChange, onOpenDrawer }: HeaderProps) {
  return (
    <header className="bg-white pt-3 pb-2 px-3 flex-shrink-0">
      <div className="flex items-center gap-2 bg-[#f1f3f4] rounded-full h-12 pl-2 pr-3">
        <button
          aria-label="Open menu"
          onClick={onOpenDrawer}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-black/5 transition-colors md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        {/* Spacer to keep search aligned when hamburger is hidden */}
        <div className="hidden md:block w-2" aria-hidden="true" />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Search className="w-4 h-4 text-[#5f6368] sm:hidden" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search in mail"
            className="w-full bg-transparent text-[15px] text-[#202124] placeholder:text-[#5f6368] outline-none"
          />
        </div>
        <div className="w-8 h-8 rounded-full bg-[#1a73e8] text-white text-[13px] font-medium flex items-center justify-center flex-shrink-0">
          U
        </div>
        <button
          aria-label="AI assistant"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#1a73e8] hover:bg-black/5 transition-colors flex-shrink-0"
        >
          <Sparkles className="w-4 h-4" fill="currentColor" />
        </button>
      </div>
    </header>
  );
}
