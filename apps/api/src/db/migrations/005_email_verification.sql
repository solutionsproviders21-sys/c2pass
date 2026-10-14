-- Proof that the account holder owns the e-mail address (link sent at registration).
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
-- Accounts that existed before this check, and OAuth accounts (the provider vouches for the address), count as verified.
UPDATE users SET email_verified_at = created_at WHERE google_id IS NOT NULL OR facebook_id IS NOT NULL OR status = 'active';

CREATE TABLE email_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verifications_user_idx ON email_verifications (user_id, created_at DESC);
