import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/server/config/env";

/** Server-only Supabase admin client (service role). Never expose to the browser. */
let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_client) {
    const env = getEnv();
    _client = createClient(
      env.SUPABASE_URL ?? "",
      env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _client;
}
