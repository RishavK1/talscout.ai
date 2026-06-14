-- Pending invites have no auth user yet (reconciled when they sign up).
ALTER TABLE users ALTER COLUMN auth_user_id DROP NOT NULL;
