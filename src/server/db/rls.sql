-- ============================================================
-- TalScout — Row-Level Security policies + app-role grants
-- Applied AFTER tables exist. The runtime app role (talscout_app)
-- is non-superuser and non-owner, so these policies are enforced.
-- Tenant context is set per-transaction via:  SET LOCAL app.tenant_id = '<uuid>'
-- current_setting(...,true) returns NULL when unset  -> fails closed (no rows).
-- ============================================================

-- Helper expression used by every policy:
--   tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid

-- ---- tenants (row keyed by its own id) ----
-- NOTE: no FORCE — policies apply to the (non-owner) app role, while the owner
-- role used for admin/bootstrap/webhook paths bypasses RLS by design.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON tenants;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ---- generic tenant-scoped tables ----
-- This list must stay in sync with every tenant-scoped table in schema.ts.
-- Production (scripts/setup-supabase.mjs) applies this exact file statement
-- by statement instead of maintaining its own copy — a hand-duplicated list
-- previously drifted out of sync and left 11 newer tables with no RLS in
-- production while this file (used for dev/test) already had them.
DO $$
DECLARE
  t text;
  scoped text[] := ARRAY[
    'users','candidates','resume_files','candidate_tags',
    'shortlists','shortlist_items','subscriptions','audit_logs','usage_counters',
    'sender_accounts','outreach_campaigns','outreach_leads','outreach_sends',
    'whatsapp_templates','blueprints',
    'automated_campaigns','automated_leads','automated_sends','automated_reply_drafts',
    'suppressed_emails'
  ];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      || 'WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid);',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- ---- grants for the restricted runtime role ----
-- (role is created by the setup script before this runs)
GRANT USAGE ON SCHEMA public TO talscout_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO talscout_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO talscout_app;
--> statement-breakpoint
-- future tables/sequences inherit the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO talscout_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO talscout_app;

-- processed_webhooks is NOT tenant-scoped (global idempotency table).
-- No RLS; app role already has CRUD via the grant above.
