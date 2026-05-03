import { Link, useLocation } from "wouter";
import { 
  Inbox as InboxIcon, 
  AlertCircle, 
  MessageSquare, 
  Calendar, 
  Settings,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: InboxIcon, label: "Inbox", href: "/" },
  { icon: AlertCircle, label: "Escalations", href: "/escalations" },
  { icon: MessageSquare, label: "Channels", href: "/channels" },
  { icon: Calendar, label: "Bookings", href: "/bookings" },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 h-full bg-white border-r border-border flex flex-col flex-shrink-0">
      <div className="h-14 flex items-center px-4 border-b border-border/50">
        <div className="flex items-center gap-2 font-semibold text-[15px] tracking-tight text-foreground">
          <div className="w-5 h-5 bg-primary text-primary-foreground rounded-sm flex items-center justify-center">
            <Package className="w-3.5 h-3.5" />
          </div>
          Unboks
        </div>
      </div>
      
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.label} href={item.href}>
              <div className={cn(
                "flex items-center gap-3 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-border/50 mt-auto">
        <Link href="/settings">
          <div className="flex items-center gap-3 px-2.5 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer">
            <Settings className="w-4 h-4" />
            Settings
          </div>
        </Link>
      </div>
    </aside>
  );
}
