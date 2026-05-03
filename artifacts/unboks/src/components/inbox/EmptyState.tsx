import { Inbox } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex-1 bg-white flex flex-col items-center justify-center p-8">
      <Inbox className="w-5 h-5 text-muted-foreground/60 mb-3" strokeWidth={1.5} />
      <h3 className="text-[14px] font-medium text-foreground mb-1">No conversations yet</h3>
      <p className="text-[13px] text-muted-foreground text-center max-w-sm">
        New messages will appear here.
      </p>
    </div>
  );
}
