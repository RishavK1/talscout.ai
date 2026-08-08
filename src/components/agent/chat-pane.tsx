"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Bot, Loader2, User, Sparkles, Search, FileText, MessageCircleQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { easeOut, item, press, stagger } from "@/lib/motion";
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
  { text: "Search for senior backend engineers with Go experience", icon: Search },
  { text: "Create a blueprint for my ideal customer", icon: FileText },
  { text: "What can you help me with?", icon: MessageCircleQuestion },
];

const TEXTAREA_MAX_HEIGHT = 160;

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
  initialPrompt,
}: {
  conversationId: string;
  onFirstMessageSent?: () => void;
  /** Pre-fills the composer (never auto-sends) — used when arriving from
   *  the Skills page's "Run now", so the user still gets a chance to look
   *  at/edit the message before it goes anywhere. */
  initialPrompt?: string;
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
      initialPrompt={initialMessages.length === 0 ? initialPrompt : undefined}
    />
  );
}

interface SkillOption {
  name: string;
  description: string;
}

function ChatPaneReady({
  conversationId,
  initialMessages,
  onFirstMessageSent,
  initialPrompt,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  onFirstMessageSent?: () => void;
  initialPrompt?: string;
}) {
  const [input, setInput] = useState(initialPrompt ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [skills, setSkills] = useState<SkillOption[] | null>(null);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);

  useEffect(() => {
    api
      .get<{ skills: SkillOption[] }>("/api/agent/skills")
      .then((res) => setSkills(res.skills))
      .catch(() => setSkills([]));
  }, []);

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

  // Auto-grows the composer as the user types past one line, instead of
  // scrolling internally inside a fixed-height box — the same behavior
  // ChatGPT/Claude.ai's own composers use. Resetting height to "auto"
  // first is required before reading scrollHeight, otherwise a textarea
  // that's grown never shrinks back down when text is deleted.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, [input]);

  const busy = status === "submitted" || status === "streaming";

  const handleSend = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || busy) return;
    sendMessage({ text: value });
    setInput("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 ? (
          <motion.div
            variants={stagger(0.07, 0.05)}
            initial="hidden"
            animate="show"
            className="mx-auto flex max-w-lg flex-col items-center pt-16 text-center"
          >
            <motion.div
              variants={item}
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-container/25 to-primary-container/5 text-primary shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-primary/10"
            >
              <Bot className="size-[28px]" />
            </motion.div>
            <motion.h2 variants={item} className="font-headline-md text-[20px] font-semibold text-primary">
              What can I help with?
            </motion.h2>
            <motion.p variants={item} className="mt-1.5 font-body-md text-[14px] text-on-surface-variant">
              Ask me to search candidates, create a blueprint, and more — I&apos;ll do it right here in chat.
            </motion.p>
            <motion.div variants={item} className="mt-6 flex w-full flex-col gap-2">
              {SUGGESTED_PROMPTS.map(({ text, icon: Icon }) => (
                <motion.button
                  key={text}
                  type="button"
                  onClick={() => handleSend(text)}
                  whileHover={{ y: -1 }}
                  whileTap={press}
                  transition={{ duration: 0.15, ease: easeOut }}
                  className="flex items-center gap-2.5 rounded-xl border border-border-low-alpha/60 bg-surface-container-low px-4 py-2.5 text-left font-body-md text-[13.5px] text-on-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-primary/20 hover:bg-surface-container"
                >
                  <Icon className="size-[15px] shrink-0 text-primary/70" />
                  {text}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                  className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      m.role === "user"
                        ? "bg-secondary-container/40 text-on-secondary-container"
                        : "bg-gradient-to-br from-primary-container/25 to-primary-container/5 text-primary ring-1 ring-primary/10",
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
                </motion.div>
              ))}
            </AnimatePresence>
            {busy && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 pl-10 font-body-md text-[13px] text-on-surface-variant"
              >
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-[4.5px] rounded-full bg-primary/60"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: easeOut }}
                    />
                  ))}
                </span>
                Thinking…
              </motion.div>
            )}
          </div>
        )}
      </div>

      <div className="relative border-t border-border-low-alpha/60 bg-surface px-4 py-3 sm:px-8">
        <AnimatePresence>
          {skillPickerOpen && skills && skills.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: easeOut }}
              className="scroll-slim absolute bottom-full left-4 right-4 z-10 mb-2 max-h-56 overflow-y-auto rounded-xl border border-border-low-alpha bg-surface shadow-lg sm:left-8 sm:right-8"
            >
              {skills
                .filter((s) => s.name.toLowerCase().includes(input.slice(1).toLowerCase()))
                .map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      setInput(`Use skill: "${s.name}"`);
                      setSkillPickerOpen(false);
                    }}
                    className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-container-low"
                  >
                    <Sparkles className="mt-0.5 size-[13px] shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-label-md text-[13px] font-semibold text-primary">{s.name}</span>
                      <span className="block truncate font-body-md text-[12px] text-on-surface-variant">{s.description}</span>
                    </span>
                  </button>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className={cn(
            "mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border bg-surface-container-low px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-150",
            composerFocused ? "border-primary/40 ring-[3px] ring-primary/10" : "border-border-low-alpha",
          )}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              const value = e.target.value;
              setInput(value);
              setSkillPickerOpen(value.startsWith("/"));
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === "Escape") setSkillPickerOpen(false);
            }}
            placeholder="Message the AI Agent… (type / for a saved skill)"
            rows={1}
            className="scroll-slim max-h-40 min-h-9 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 font-body-md text-[14px] outline-none placeholder:text-on-surface-variant/70"
          />
          <motion.button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || busy}
            whileTap={input.trim() && !busy ? press : undefined}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-all duration-150 disabled:opacity-40 disabled:shadow-none"
          >
            <ArrowUp className="size-[16px]" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
