-- Private beta (cahier des charges p. 20, Ph.7) and waitlist (p. 27): invitation codes, sent from the waitlist.
CREATE TABLE invites (
  code        text PRIMARY KEY,
  note        text,
  max_uses    int NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses        int NOT NULL DEFAULT 0,
  email       text,                       -- waitlist address the code was sent to
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN invite_code text REFERENCES invites(code) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN invited_at timestamptz;
CREATE INDEX leads_email_idx ON leads (lower(email));
