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
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---- generic tenant-scoped tables ----
DO $$
DECLARE
  t text;
  scoped text[] := ARRAY[
    'users','candidates','resume_files','candidate_tags',
    'shortlists','shortlist_items','subscriptions','audit_logs','usage_counters'
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

-- ---- grants for the restricted runtime role ----
-- (role is created by the setup script before this runs)
GRANT USAGE ON SCHEMA public TO talscout_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO talscout_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO talscout_app;
-- future tables/sequences inherit the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO talscout_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO talscout_app;

-- processed_webhooks is NOT tenant-scoped (global idempotency table).
-- No RLS; app role already has CRUD via the grant above.
