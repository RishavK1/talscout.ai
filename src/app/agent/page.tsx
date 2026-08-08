"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Bot, Loader2, Lock, Menu } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/app/auth-provider";
import { api } from "@/lib/api";
import { ConversationList, type AgentConversation } from "@/components/agent/conversation-list";
import { ChatPane } from "@/components/agent/chat-pane";

/**
 * Standalone AI Agent surface — deliberately NOT wrapped in <AppShell>.
 * Opened in a new browser tab from the sidebar (see app-shell.tsx's
 * `newTab` nav item), it gets the whole tab as a focused chat workspace
 * instead of competing for space inside the main app's sidebar/topbar
 * chrome, the way ChatGPT/Claude.ai's own chat surfaces work.
 */
function AgentPageContent() {
  const { can, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const [conversations, setConversations] = useState<AgentConversation[] | null>(null);
  const [creating, setCreating] = useState(false);
  // Sidebar is a fixed always-visible column on large screens and an
  // off-canvas overlay on small ones (there was no way to get back to the
  // chat list on a phone/tablet before this — the 288px-wide rail simply
  // ate most of the viewport with no toggle). Defaults closed on mobile;
  // the lg:translate-x-0 override in ConversationList's wrapper makes this
  // state irrelevant on larger screens.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get<{ conversations: AgentConversation[] }>("/api/agent/conversations");
      setConversations(res.conversations);
      return res.conversations;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load conversations");
      setConversations([]);
      return [];
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const selectConversation = (id: string) => {
    router.push(`/agent?c=${id}`);
    setMobileSidebarOpen(false);
  };

  const handleNew = async () => {
    setCreating(true);
    try {
      const res = await api.post<{ conversation: AgentConversation }>("/api/agent/conversations", {});
      await loadConversations();
      selectConversation(res.conversation.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start a new chat");
    } finally {
      setCreating(false);
    }
  };

  const handlePin = async (id: string, pinned: boolean) => {
    setConversations((prev) => prev?.map((c) => (c.id === id ? { ...c, pinned } : c)) ?? prev);
    try {
      await api.patch(`/api/agent/conversations/${id}`, { pinned });
    } catch {
      toast.error("Failed to update chat");
      loadConversations();
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await api.delete(`/api/agent/conversations/${id}`);
      const updated = await loadConversations();
      if (activeId === id) {
        const next = updated.find((c) => c.id !== id);
        router.push(next ? `/agent?c=${next.id}` : "/agent");
      }
    } catch {
      toast.error("Failed to archive chat");
    }
  };

  if (authLoading || conversations === null) {
    return (
      <main className="flex h-dvh items-center justify-center bg-surface">
        <Loader2 className="size-[24px] animate-spin text-on-surface-variant" />
      </main>
    );
  }

  if (!can("ai_agent")) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container/10 text-primary">
          <Lock className="size-[26px]" />
        </div>
        <h1 className="font-headline-md text-[20px] font-semibold text-primary">
          AI Agent isn&apos;t on your plan
        </h1>
        <p className="max-w-sm font-body-md text-[14px] text-on-surface-variant">
          Upgrade to Growth or Scale to chat with the AI Agent and let it take real actions in your workspace.
        </p>
        <Link
          href="/billing"
          className="mt-2 rounded-xl bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary"
        >
          View plans
        </Link>
      </main>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-surface">
      {/* Mobile scrim — click-outside-to-close for the overlay sidebar. */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={selectConversation}
          onNew={handleNew}
          onPin={handlePin}
          onArchive={handleArchive}
          creating={creating}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open chat list"
          className="m-2 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg text-on-surface-variant hover:bg-surface-container lg:hidden"
        >
          <Menu className="size-[18px]" />
        </button>
        {activeId ? (
          <ChatPane key={activeId} conversationId={activeId} onFirstMessageSent={loadConversations} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container/10 text-primary">
              <Bot className="size-[26px]" />
            </div>
            <p className="font-body-md text-[14px] text-on-surface-variant">
              Select a chat, or start a new one.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AgentPage() {
  return (
    <Suspense
      fallback={
        <main className="flex h-dvh items-center justify-center bg-surface">
          <Loader2 className="size-[24px] animate-spin text-on-surface-variant" />
        </main>
      }
    >
      <AgentPageContent />
    </Suspense>
  );
}
