"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, CircleCheck, CircleX, Search, FileText, Wrench, ExternalLink, ChartLine } from "lucide-react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";

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
};

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

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border-low-alpha/60 bg-surface-container-low px-3.5 py-2.5 text-[13px]">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          isError ? "bg-error-container text-on-error-container" : "bg-primary-container/10 text-primary",
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
    </div>
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
