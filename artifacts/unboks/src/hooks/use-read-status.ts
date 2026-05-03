import { useState, useCallback } from "react";

export function useReadStatus(initialUnread: Set<string> = new Set()) {
  const [unread, setUnread] = useState<Set<string>>(initialUnread);

  const markRead = useCallback((id: string) => {
    setUnread((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const markUnread = useCallback((id: string) => {
    setUnread((prev) => new Set(prev).add(id));
  }, []);

  const isUnread = useCallback((id: string) => unread.has(id), [unread]);

  return { unread, markRead, markUnread, isUnread };
}
