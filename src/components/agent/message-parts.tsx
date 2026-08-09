"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { Loader2, CircleCheck, CircleX, Search, FileText, Wrench, ExternalLink, ChartLine, Globe, Sparkles, Mail, Rocket, Plug, Clock } from "lucide-react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { easeOut } from "@/lib/motion";

/** Renders the model's Markdown output (bold, lists, tables, links — the
 *  model writes GFM-flavored Markdown naturally, e.g. "**pong**" or a
 *  "| ID | Name |" table) as real formatted content instead of showing the
 *  raw `**`/`|` syntax as literal text. Styled with this app's own tokens
 *  rather than Tailwind's `prose` plugin (not installed, and this app
 *  already has its own type-scale/color conventions to match). */
function Markdown({ text }: { text: string }) {
  return (
    <div className="agent-markdown font-body-md text-[14.5px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-secondary underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-surface-container-high px-1 py-0.5 font-mono text-[13px]">{children}</code>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto rounded-lg border border-border-low-alpha/60 last:mb-0">
              <table className="w-full border-collapse text-[13.5px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-container-low">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border-low-alpha/60 px-3 py-2 text-left font-label-md font-semibold text-primary">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-border-low-alpha/40 px-3 py-2">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

const TOOL_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  search_candidates: { label: "Searching candidates", icon: Search },
  list_blueprints: { label: "Listing blueprints", icon: FileText },
  create_blueprint: { label: "Creating blueprint", icon: FileText },
  get_workspace_stats: { label: "Checking workspace numbers", icon: ChartLine },
  research_blueprint_website: { label: "Researching website", icon: Globe },
  generate_blueprint: { label: "Generating blueprint", icon: Sparkles },
  list_sender_accounts: { label: "Checking connected senders", icon: Mail },
  research_campaign_market: { label: "Researching market", icon: Globe },
  create_campaign: { label: "Creating campaign", icon: FileText },
  activate_campaign: { label: "Activating campaign", icon: Rocket },
  list_campaigns: { label: "Checking campaign status", icon: ChartLine },
  connect_app: { label: "Connecting app", icon: Plug },
  save_skill: { label: "Saving skill", icon: Sparkles },
  use_skill: { label: "Loading skill", icon: Sparkles },
  schedule_task: { label: "Scheduling task", icon: Clock },
  list_tasks: { label: "Checking scheduled tasks", icon: Clock },
  cancel_task: { label: "Pausing task", icon: Clock },
};

/** connect_app's success shape — rendered as a real, prominent "Connect X"
 *  button (not just a generic "Open" link) so authorizing a new app is one
 *  click from inside the chat, matching the system design doc's "connect-
 *  app card" — the same pattern Settings' own connect flow uses under the
 *  hood (createConnectLink), just surfaced here instead of on a page. */
function isConnectAppResult(v: unknown): v is { url: string; toolkitSlug: string } {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).url === "string" &&
    typeof (v as Record<string, unknown>).toolkitSlug === "string"
  );
}

/** Renders a tool-call part as a small "doing X… / done" card instead of
 *  raw JSON — the default renderer any current or future tool gets for
 *  free, per the system design doc's "generic pending -> done/failed card"
 *  pattern. Result-link cards (e.g. a created blueprint) get an extra link
 *  when the tool result includes a `url` field. Takes plain fields (not the
 *  raw part) so it works for both statically-named tools (`type:
 *  "tool-search_candidates"`) and dynamically-named ones (`type:
 *  "dynamic-tool"`, `toolName: "..."`) — Composio tools in a later phase
 *  come through as the latter, and without this the whole card would
 *  simply never render (message-parts silently dropping content that
 *  arrived is worse than a slightly-generic label for an unrecognized
 *  tool). */
function ToolPart({
  toolName,
  state,
  output,
}: {
  toolName: string;
  state: string;
  output: unknown;
}) {
  const meta = TOOL_META[toolName] ?? { label: toolName.replace(/_/g, " "), icon: Wrench };
  const Icon = meta.icon;

  const isDone = state === "output-available";
  const isError = state === "output-error" || state === "output-denied";
  const result = isDone && typeof output === "object" && output !== null ? (output as Record<string, unknown>) : null;
  const resultUrl = result && typeof result.url === "string" ? result.url : null;

  if (toolName === "connect_app" && isDone && isConnectAppResult(output)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: easeOut }}
        className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary-container/12 to-primary-container/4 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-[0_1px_2px_rgba(15,23,42,0.16)]">
          <Plug className="size-[16px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-label-md text-[13px] font-semibold text-primary">
            Connect {output.toolkitSlug}
          </p>
          <p className="text-[12px] text-on-surface-variant">Opens in a new tab — come back and try again once connected.</p>
        </div>
        <a
          href={output.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg bg-primary px-3.5 py-2 font-label-md text-[12.5px] font-semibold text-on-primary shadow-[0_1px_2px_rgba(15,23,42,0.16)] transition-all hover:brightness-110 active:brightness-95"
        >
          Connect
        </a>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: easeOut }}
      className="flex items-center gap-2.5 rounded-xl border border-border-low-alpha/60 bg-surface-container-low px-3.5 py-2.5 text-[13px] transition-colors"
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          isError
            ? "bg-error-container text-on-error-container"
            : "bg-gradient-to-br from-primary-container/25 to-primary-container/5 text-primary ring-1 ring-primary/10",
        )}
      >
        {isDone || isError ? (
          isError ? <CircleX className="size-[15px]" /> : <CircleCheck className="size-[15px]" />
        ) : (
          <Icon className="size-[15px]" />
        )}
      </span>
      <span className="flex-1 min-w-0 text-on-surface-variant">
        {isError ? `Couldn't finish: ${meta.label.toLowerCase()}` : isDone ? meta.label : `${meta.label}…`}
        {!isDone && !isError && (
          <Loader2 className="ml-1.5 inline size-[12px] animate-spin align-[-1px]" />
        )}
      </span>
      {resultUrl && (
        <Link
          href={resultUrl}
          target="_blank"
          className="flex shrink-0 items-center gap-1 font-label-md text-[12px] font-semibold text-secondary hover:underline"
        >
          Open <ExternalLink className="size-[12px]" />
        </Link>
      )}
    </motion.div>
  );
}

export function MessageParts({ message }: { message: UIMessage }) {
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text ? <Markdown key={i} text={part.text} /> : null;
        }
        if (part.type.startsWith("tool-")) {
          const p = part as Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;
          return <ToolPart key={i} toolName={p.type.replace(/^tool-/, "")} state={p.state} output={p.output} />;
        }
        if (part.type === "dynamic-tool") {
          return <ToolPart key={i} toolName={part.toolName} state={part.state} output={part.output} />;
        }
        return null;
      })}
    </div>
  );
}
