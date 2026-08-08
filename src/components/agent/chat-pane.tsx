"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { toast } from "sonner";
import { ArrowUp, Bot, Loader2, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { MessageParts } from "@/components/agent/message-parts";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** The AI SDK's HTTP transport takes the raw response BODY TEXT as the
 *  error message on any non-200 response (see its `sendMessages`) — our
 *  API returns structured JSON (`{"error":{"code","message"}}`) for
 *  non-streaming failures (rate limit, bad request, plan/capability
 *  errors), so without this, the toast would show that literal JSON blob
 *  instead of the human-readable message inside it. */
function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message;
    return typeof message === "string" ? message : raw;
  } catch {
    return raw;
  }
}

const SUGGESTED_PROMPTS = [
  "Search for senior backend engineers with Go experience",
  "Create a blueprint for my ideal customer",
  "What can you help me with?",
];

/** Thin wrapper: fetches this conversation's saved history BEFORE mounting
 *  the actual chat UI. `useChat`'s `messages` option only seeds its
 *  internal store once, at construction — mounting it before the history
 *  fetch resolves would permanently lock it to an empty chat, which is
 *  exactly what was happening on refresh (the conversation stayed in the
 *  sidebar because that row loads separately, but the message content
 *  never made it into the hook). Keeping the fetch here, one level up from
 *  the component that calls `useChat`, is what fixes that. */
export function ChatPane({
  conversationId,
  onFirstMessageSent,
}: {
  conversationId: string;
  onFirstMessageSent?: () => void;
}) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInitialMessages(null);
    (async () => {
      const headers = await authHeaders();
      const res = await fetch(`/api/agent/conversations/${conversationId}/messages`, { headers });
      if (cancelled) return;
      if (!res.ok) {
        setInitialMessages([]);
        return;
      }
      const json = await res.json();
      const rows = (json.data?.messages ?? []) as { id: string; role: string; parts: unknown }[];
      setInitialMessages(rows.map((r) => ({ id: r.id, role: r.role, parts: r.parts }) as UIMessage));
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (initialMessages === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-[22px] animate-spin text-on-surface-variant" />
      </div>
    );
  }

  return (
    <ChatPaneReady
      conversationId={conversationId}
      initialMessages={initialMessages}
      onFirstMessageSent={onFirstMessageSent}
    />
  );
}

function ChatPaneReady({
  conversationId,
  initialMessages,
  onFirstMessageSent,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  onFirstMessageSent?: () => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/agent/conversations/${conversationId}/messages`,
        headers: authHeaders,
      }),
    [conversationId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      onFirstMessageSent?.();
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (error) toast.error(extractErrorMessage(error.message) || "The agent ran into a problem");
  }, [error]);

  const busy = status === "submitted" || status === "streaming";

  const handleSend = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || busy) return;
    sendMessage({ text: value });
    setInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center pt-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container/10 text-primary">
              <Bot className="size-[28px]" />
            </div>
            <h2 className="font-headline-md text-[20px] font-semibold text-primary">
              What can I help with?
            </h2>
            <p className="mt-1.5 font-body-md text-[14px] text-on-surface-variant">
              Ask me to search candidates, create a blueprint, and more — I&apos;ll do it right here in chat.
            </p>
            <div className="mt-6 flex w-full flex-col gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSend(p)}
                  className="rounded-xl border border-border-low-alpha/60 bg-surface-container-low px-4 py-2.5 text-left font-body-md text-[13.5px] text-on-surface transition-colors hover:bg-surface-container"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    m.role === "user"
                      ? "bg-secondary-container/40 text-on-secondary-container"
                      : "bg-primary-container/10 text-primary",
                  )}
                >
                  {m.role === "user" ? <User className="size-[14px]" /> : <Bot className="size-[14px]" />}
                </span>
                <div
                  className={cn(
                    "min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5",
                    m.role === "user" ? "bg-primary-container/10" : "bg-transparent",
                  )}
                >
                  <MessageParts message={m} />
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 pl-10 font-body-md text-[13px] text-on-surface-variant">
                <Loader2 className="size-[13px] animate-spin" />
                Thinking…
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border-low-alpha/60 bg-surface px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-border-low-alpha bg-surface-container-low px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message the AI Agent…"
            rows={1}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 font-body-md text-[14px] outline-none placeholder:text-on-surface-variant/70"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-[16px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
