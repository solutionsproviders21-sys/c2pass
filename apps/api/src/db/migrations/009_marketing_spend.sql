-- Marketing spend per month and channel, for the CAC / LTV indicators (cahier des charges p. 24).
CREATE TABLE marketing_spend (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month       date NOT NULL CHECK (extract(day FROM month) = 1),
  channel     text NOT NULL,
  amount_xaf  int NOT NULL CHECK (amount_xaf > 0),
  note        text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_spend_month_idx ON marketing_spend (month);
