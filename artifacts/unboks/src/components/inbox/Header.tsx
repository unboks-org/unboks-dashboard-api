import { ReactNode } from "react";
import { Menu, Search } from "lucide-react";
import { motion } from "framer-motion";

interface HeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  searchQuery: string;
  onSearchChange?: (query: string) => void;
  onOpenDrawer: () => void;
  /**
   * Optional right-side slot rendered between the title block and the
   * search box. Used by the dashboard shell to mount the manual
   * Refresh control without leaking React Query knowledge into Header.
   */
  rightSlot?: ReactNode;
}

export function Header({
  title,
  subtitle,
  searchQuery,
  onSearchChange,
  onOpenDrawer,
  rightSlot,
}: HeaderProps) {
  const showSearch = typeof onSearchChange === "function";
  const hasTitleBlock = Boolean(title) || Boolean(subtitle);

  return (
    <header className="bg-background border-b border-border flex-shrink-0 pt-[env(safe-area-inset-top)] z-30 relative">
      <div className="flex items-center gap-3 px-3 sm:px-5 py-2.5 md:py-3 min-h-[56px] md:min-h-[64px]">
        {/* Mobile drawer toggle */}
        <motion.button
          aria-label="Open menu"
          onClick={onOpenDrawer}
          whileTap={{ scale: 0.94, opacity: 0.8 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors md:hidden flex-shrink-0"
        >
          <Menu className="w-[22px] h-[22px]" strokeWidth={1.5} />
        </motion.button>

        {/* Title block */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h1 className="text-[19px] md:text-[21px] font-medium tracking-tight text-foreground leading-none truncate">
            {title || "\u00A0"}
          </h1>
          {subtitle && (
            <div className="text-[13px] font-medium text-muted-foreground mt-1 truncate">
              {subtitle}
            </div>
          )}
        </div>
        {!hasTitleBlock && null}

        {rightSlot}

        {/* Compact desktop search */}
        {showSearch && (
          <div className="hidden md:flex items-center h-[36px] w-[300px] lg:w-[340px] flex-shrink-0 rounded-full border border-border bg-card px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-all shadow-sm">
            <Search className="w-[15px] h-[15px] text-muted-foreground flex-shrink-0" strokeWidth={2} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search messages"
              className="flex-1 min-w-0 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none px-2.5"
            />
          </div>
        )}
      </div>

      {/* Mobile search row */}
      {showSearch && (
        <div className="md:hidden px-3 pb-3">
          <div className="flex items-center min-h-[44px] rounded-xl border border-border bg-card px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-all shadow-sm">
            <Search className="w-[15px] h-[15px] text-muted-foreground flex-shrink-0" strokeWidth={2} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search messages"
              className="flex-1 min-w-0 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none px-2.5"
            />
          </div>
        </div>
      )}
    </header>
  );
}
