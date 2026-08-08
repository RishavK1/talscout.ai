import { randomUUID } from "node:crypto";
import type { ConnectionProvider, ToolkitConnection } from "@/server/ports";

const CATALOG = [
  { slug: "gmail", name: "Gmail", logoUrl: null },
  { slug: "googlecalendar", name: "Google Calendar", logoUrl: null },
  { slug: "notion", name: "Notion", logoUrl: null },
];

/** In-memory connections, keyed by tenantId — mirrors MockOutreachMailer's
 *  "captures state in memory so tests/dev can exercise it, nothing external
 *  is ever touched" convention. Connecting is instant (no real OAuth hop):
 *  createConnectLink immediately records an "active" row and returns a
 *  fake redirect URL that resolves back to the given redirectUrl. */
export class MockConnectionProvider implements ConnectionProvider {
  private readonly byTenant = new Map<string, ToolkitConnection[]>();

  async createConnectLink(args: {
    tenantId: string;
    toolkitSlug: string;
    callbackUrl: string;
  }): Promise<{ url: string; connectionId: string }> {
    const list = this.byTenant.get(args.tenantId) ?? [];
    const connectionId = randomUUID();
    list.push({
      id: connectionId,
      toolkitSlug: args.toolkitSlug,
      status: "active",
      accountLabel: `mock-${args.toolkitSlug}@example.com`,
      createdAt: new Date().toISOString(),
    });
    this.byTenant.set(args.tenantId, list);
    // No real OAuth hop in mock mode — land straight on the callback URL,
    // same as Composio would after a real consent flow completes.
    return { url: args.callbackUrl, connectionId };
  }

  async listConnections(tenantId: string): Promise<ToolkitConnection[]> {
    return this.byTenant.get(tenantId) ?? [];
  }

  async getConnection(tenantId: string, connectionId: string): Promise<ToolkitConnection | null> {
    return (this.byTenant.get(tenantId) ?? []).find((c) => c.id === connectionId) ?? null;
  }

  async listAvailableToolkits() {
    return CATALOG;
  }

  async disconnect(tenantId: string, connectionId: string): Promise<void> {
    const list = this.byTenant.get(tenantId) ?? [];
    this.byTenant.set(
      tenantId,
      list.filter((c) => c.id !== connectionId),
    );
  }
}
