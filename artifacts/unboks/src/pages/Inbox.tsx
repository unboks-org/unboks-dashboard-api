import { useState, useMemo } from "react";
import { Sidebar } from "@/components/inbox/Sidebar";
import { Header } from "@/components/inbox/Header";
import { Toolbar } from "@/components/inbox/Toolbar";
import { ChannelTabs } from "@/components/inbox/ChannelTabs";
import { MessageList } from "@/components/inbox/MessageList";
import { EmptyState } from "@/components/inbox/EmptyState";
import { conversations, Channel } from "@/data/conversations";

export default function Inbox() {
  const [activeTab, setActiveTabState] = useState<Channel>("All");
  const [searchQuery, setSearchQueryState] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localConversations, setLocalConversations] = useState(conversations);

  // Clear selection when the visible set changes via filter/search,
  // so bulk actions never apply to hidden rows.
  const setActiveTab = (tab: Channel) => {
    setSelectedIds(new Set());
    setActiveTabState(tab);
  };
  const setSearchQuery = (q: string) => {
    setSelectedIds(new Set());
    setSearchQueryState(q);
  };

  // Compute counts per channel
  const counts = useMemo(() => {
    const c = { All: localConversations.length } as Record<Channel, number>;
    localConversations.forEach(conv => {
      c[conv.channel] = (c[conv.channel] || 0) + 1;
    });
    return c;
  }, [localConversations]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    let filtered = localConversations;
    
    if (activeTab !== "All") {
      filtered = filtered.filter(c => c.channel === activeTab);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => 
        c.sender.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [localConversations, activeTab, searchQuery]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredConversations.map(c => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleMarkRead = () => {
    setLocalConversations(prev => 
      prev.map(c => selectedIds.has(c.id) ? { ...c, unread: false } : c)
    );
    setSelectedIds(new Set());
  };

  const handleMarkUnread = () => {
    setLocalConversations(prev => 
      prev.map(c => selectedIds.has(c.id) ? { ...c, unread: true } : c)
    );
    setSelectedIds(new Set());
  };

  const handleArchive = () => {
    setLocalConversations(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <Toolbar 
          selectedCount={selectedIds.size}
          totalCount={filteredConversations.length}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onMarkRead={handleMarkRead}
          onMarkUnread={handleMarkUnread}
          onArchive={handleArchive}
        />
        <ChannelTabs 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          counts={counts}
        />
        {filteredConversations.length > 0 ? (
          <MessageList 
            conversations={filteredConversations}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
