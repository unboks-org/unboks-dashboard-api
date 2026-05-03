import { Conversation } from "@/data/conversations";
import { MessageRow } from "./MessageRow";

interface MessageListProps {
  conversations: Conversation[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

export function MessageList({ conversations, selectedIds, onToggleSelect }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="flex flex-col">
        {conversations.map((conv) => (
          <MessageRow
            key={conv.id}
            conversation={conv}
            isSelected={selectedIds.has(conv.id)}
            onToggleSelect={() => onToggleSelect(conv.id)}
          />
        ))}
      </div>
    </div>
  );
}
