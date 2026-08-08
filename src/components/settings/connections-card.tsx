"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Calendar, NotebookText, Blocks, Unlink } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface ToolkitConnection {
  id: string;
  toolkitSlug: string;
  status: "active" | "pending" | "expired" | "revoked";
  accountLabel: string | null;
}

interface CuratedToolkit {
  slug: string;
  name: string;
}

const TOOLKIT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  gmail: Mail,
  googlecalendar: Calendar,
  notion: NotebookText,
};

/**
 * "Connected apps" — Settings' entry point to Composio-backed third-party
 * connections (see the system design doc's Part A). Deliberately a short,
 * curated list of buttons here; the AI Agent chat is the escape hatch for
 * connecting anything else in Composio's wider catalog (Phase 3).
 */
export function ConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<ToolkitConnection[]>([]);
  const [toolkits, setToolkits] = useState<CuratedToolkit[]>([]);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ToolkitConnection | null>(null);

  const load = async () => {
    try {
      const res = await api.get<{ connections: ToolkitConnection[]; toolkits: CuratedToolkit[] }>(
        "/api/connections",
      );
      setConnections(res.connections);
      setToolkits(res.toolkits);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load connected apps");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleConnect = async (slug: string) => {
    setConnectingSlug(slug);
    try {
      const { url } = await api.post<{ url: string }>(`/api/connections/${slug}/link`, {});
      window.location.assign(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start connection");
      setConnectingSlug(null);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectTarget) return;
    try {
      await api.delete(`/api/connections/${disconnectTarget.id}`);
      toast.success(`Disconnected ${disconnectTarget.toolkitSlug}`);
      setDisconnectTarget(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  return (
    <>
      <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
        <CardHeader>
          <CardTitle className="text-[18px] font-semibold text-primary">Connected apps</CardTitle>
          <CardDescription className="font-body-md text-on-surface-variant">
            Connect Gmail, Calendar, and other apps once — the AI Agent and your campaigns can then
            use them directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {toolkits.map((toolkit) => {
                const conn = connections.find((c) => c.toolkitSlug === toolkit.slug);
                const Icon = TOOLKIT_ICON[toolkit.slug] ?? Blocks;
                return (
                  <div
                    key={toolkit.slug}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-low-alpha/50 bg-bg-cream/30 px-4 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                        <Icon className="size-[20px]" />
                      </div>
                      <div>
                        <p className="font-label-md text-primary font-semibold">{toolkit.name}</p>
                        {conn?.status === "active" && conn.accountLabel ? (
                          <p className="text-[13px] text-on-surface-variant">{conn.accountLabel}</p>
                        ) : conn?.status === "pending" ? (
                          <p className="text-[13px] text-on-surface-variant">Finishing connection…</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {conn && conn.status !== "revoked" && conn.status !== "expired" ? (
                        <>
                          <StatusBadge tone={conn.status === "active" ? "active" : "invited"}>
                            {conn.status === "active" ? "Connected" : "Pending"}
                          </StatusBadge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDisconnectTarget(conn)}
                          >
                            <Unlink className="size-[14px]" />
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="gradient"
                          size="sm"
                          loading={connectingSlug === toolkit.slug}
                          onClick={() => handleConnect(toolkit.slug)}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!disconnectTarget}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={handleDisconnect}
        title={`Disconnect ${disconnectTarget?.toolkitSlug ?? ""}?`}
        description="Anything relying on this connection — including the AI Agent — will lose access until you reconnect it."
        confirmLabel="Disconnect"
        destructive
      />
    </>
  );
}
