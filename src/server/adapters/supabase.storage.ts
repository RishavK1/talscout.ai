import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/server/config/env";
import type { Storage, PresignResult } from "@/server/ports";

/** Real object storage via Supabase Storage (service-role client, server-only). */
export class SupabaseStorage implements Storage {
  private client: SupabaseClient;
  private bucket: string;

  constructor() {
    const env = getEnv();
    this.client = createClient(
      env.SUPABASE_URL ?? "",
      env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } },
    );
    this.bucket = env.SUPABASE_STORAGE_BUCKET;
  }

  async createPresignedUpload(args: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignResult> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(args.key);
    if (error || !data) throw new Error(`presign failed: ${error?.message}`);
    return { uploadUrl: data.signedUrl, key: args.key };
  }

  async putObject(key: string, bytes: Buffer, contentType?: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(key, bytes, { contentType, upsert: true });
    if (error) throw new Error(`upload failed: ${error.message}`);
  }

  async getObject(key: string): Promise<Buffer | null> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getObject(key)) !== null;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([key]);
  }
}
