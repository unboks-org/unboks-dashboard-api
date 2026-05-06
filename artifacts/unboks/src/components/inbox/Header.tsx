import { ReactNode } from "react";
import { Menu, Search } from "lucide-react";

interface HeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  searchQuery: string;
  onSearchChange?: (query: string) => void;
  onOpenDrawer: () => void;
}

export function Header({
  title,
  subtitle,
  searchQuery,
  onSearchChange,
  onOpenDrawer,
}: HeaderProps) {
  const showSearch = typeof onSearchChange === "function";
  const hasTitleBlock = Boolean(title) || Boolean(subtitle);

  return (
    <header className="bg-white border-b border-[#eef0f3] flex-shrink-0">
      <div className="flex items-center gap-3 px-3 sm:px-5 py-2.5 md:py-3">
        {/* Mobile drawer toggle */}
        <button
          aria-label="Open menu"
          onClick={onOpenDrawer}
          className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors md:hidden flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Title block */}
        {hasTitleBlock && (
          <div className="flex-1 min-w-0">
            {title && (
              <h1 className="text-[18px] md:text-[19px] font-semibold tracking-tight text-[#1f2937] leading-tight truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <div className="text-[12.5px] text-[#6b7280] leading-tight mt-0.5 truncate">
                {subtitle}
              </div>
            )}
          </div>
        )}

        {/* Spacer when no title (e.g. Settings) so search still aligns right */}
        {!hasTitleBlock && <div className="flex-1" aria-hidden="true" />}

        {/* Compact desktop search (right side) */}
        {showSearch && (
          <div className="hidden md:flex items-center h-9 w-[300px] lg:w-[340px] flex-shrink-0 rounded-lg border border-[#e2e6ec] bg-white px-2.5 focus-within:border-[#1a73e8] focus-within:ring-2 focus-within:ring-[#1a73e8]/15 transition-colors">
            <Search className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search messages"
              className="flex-1 min-w-0 bg-transparent text-[13.5px] text-[#1f2937] placeholder:text-[#9aa0a6] outline-none px-2"
            />
          </div>
        )}
      </div>

      {/* Mobile search row (stacked under title) */}
      {showSearch && (
        <div className="md:hidden px-3 pb-2.5">
          <div className="flex items-center h-9 rounded-lg border border-[#e2e6ec] bg-white px-2.5 focus-within:border-[#1a73e8] focus-within:ring-2 focus-within:ring-[#1a73e8]/15 transition-colors">
            <Search className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search messages"
              className="flex-1 min-w-0 bg-transparent text-[13.5px] text-[#1f2937] placeholder:text-[#9aa0a6] outline-none px-2"
            />
          </div>
        </div>
      )}
    </header>
  );
}
