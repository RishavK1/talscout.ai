"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pin, PinOff, Archive, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentConversation {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

function groupLabel(updatedAt: string): string {
  const d = new Date(updatedAt);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 days";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onPin,
  onArchive,
  creating,
}: {
  conversations: AgentConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
  creating: boolean;
}) {
  const [query, setQuery] = useState("");

  const { pinned, grouped } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
    const pinnedList = filtered.filter((c) => c.pinned);
    const rest = filtered.filter((c) => !c.pinned);
    const byGroup = new Map<string, AgentConversation[]>();
    for (const c of rest) {
      const g = groupLabel(c.updatedAt);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(c);
    }
    return { pinned: pinnedList, grouped: byGroup };
  }, [conversations, query]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-border-low-alpha/60 bg-surface-container-low">
      <div className="flex items-center gap-2 px-4 pt-5 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
          <Bot className="size-[18px]" />
        </div>
        <span className="font-headline-md text-[15px] font-semibold text-primary">AI Agent</span>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onNew}
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 font-label-md text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="size-[16px]" />
          New chat
        </button>
      </div>

      {conversations.length > 6 && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-border-low-alpha/60 bg-surface px-2.5 py-1.5">
            <Search className="size-[13px] shrink-0 text-on-surface-variant" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full bg-transparent font-body-md text-[13px] outline-none placeholder:text-on-surface-variant/70"
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-center font-body-md text-[13px] text-on-surface-variant">
            No chats yet — start one above.
          </p>
        ) : (
          <>
            {pinned.length > 0 && (
              <ConversationGroup
                label="Pinned"
                items={pinned}
                activeId={activeId}
                onSelect={onSelect}
                onPin={onPin}
                onArchive={onArchive}
              />
            )}
            {GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => (
              <ConversationGroup
                key={g}
                label={g}
                items={grouped.get(g)!}
                activeId={activeId}
                onSelect={onSelect}
                onPin={onPin}
                onArchive={onArchive}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ConversationGroup({
  label,
  items,
  activeId,
  onSelect,
  onPin,
  onArchive,
}: {
  label: string;
  items: AgentConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div className="mb-2">
      <p className="px-2.5 pt-2 pb-1 font-label-md text-[10.5px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
        {label}
      </p>
      {items.map((c) => (
        <div
          key={c.id}
          className={cn(
            "group flex items-center gap-1 rounded-lg px-2.5 py-2 text-left transition-colors",
            c.id === activeId ? "bg-primary-container/10" : "hover:bg-surface-container",
          )}
        >
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              "min-w-0 flex-1 truncate text-left font-body-md text-[13px]",
              c.id === activeId ? "font-semibold text-primary" : "text-on-surface",
            )}
          >
            {c.title}
          </button>
          <button
            type="button"
            onClick={() => onPin(c.id, !c.pinned)}
            title={c.pinned ? "Unpin" : "Pin"}
            className="hidden shrink-0 rounded p-1 text-on-surface-variant hover:text-primary group-hover:block"
          >
            {c.pinned ? <PinOff className="size-[13px]" /> : <Pin className="size-[13px]" />}
          </button>
          <button
            type="button"
            onClick={() => onArchive(c.id)}
            title="Archive"
            className="hidden shrink-0 rounded p-1 text-on-surface-variant hover:text-error group-hover:block"
          >
            <Archive className="size-[13px]" />
          </button>
        </div>
      ))}
    </div>
  );
}
