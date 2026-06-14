import type { Storage, PresignResult } from "@/server/ports";

/** In-memory storage for dev/test. The "presigned upload" is simulated by the
 *  test/client calling putObject directly. */
export class MockStorage implements Storage {
  private store = new Map<string, { bytes: Buffer; contentType?: string }>();

  async createPresignedUpload(args: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignResult> {
    return { uploadUrl: `mock://upload/${encodeURIComponent(args.key)}`, key: args.key };
  }

  async putObject(key: string, bytes: Buffer, contentType?: string): Promise<void> {
    this.store.set(key, { bytes, contentType });
  }

  async getObject(key: string): Promise<Buffer | null> {
    return this.store.get(key)?.bytes ?? null;
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }
}
