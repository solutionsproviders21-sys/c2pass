-- Refund requests (CGU §7 C2 guarantee of the Pack Réussite, §8 withdrawal within 7 days) and renewal reminders.
CREATE TABLE refund_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id      uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('withdrawal', 'c2_guarantee', 'admin')),
  reason          text,
  attestation_key text,                                  -- storage key of the official TCF attestation (guarantee)
  attestation_type text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note      text,
  decided_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz
);
CREATE INDEX refund_requests_status_idx ON refund_requests (status, created_at);
-- One open or granted request per payment; a rejected one can be followed by a new request.
CREATE UNIQUE INDEX refund_requests_payment_key ON refund_requests (payment_id) WHERE status <> 'rejected';

-- Expiry date the last renewal reminder was sent for (avoids sending it twice).
ALTER TABLE users ADD COLUMN plan_reminded_for timestamptz;
