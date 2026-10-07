-- C2Pass relational schema (cahier des charges §5.1). The question bank, audio files and
-- writing submissions live in MongoDB (§5.2).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  password_hash   text,                                   -- null for OAuth-only accounts
  role            text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  totp_secret     jsonb,                                  -- AES-256-GCM sealed (the "2fa_secret" of the spec)
  totp_enabled    boolean NOT NULL DEFAULT false,
  google_id       text UNIQUE,
  facebook_id     text UNIQUE,
  plan_id         text NOT NULL DEFAULT 'free',
  plan_expires_at timestamptz,
  c2_guarantee_until timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE status <> 'deleted';

CREATE TABLE profiles (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name      text NOT NULL DEFAULT '',
  last_name       text NOT NULL DEFAULT '',
  country         text,
  city            text,
  phone           text,
  whatsapp        text,
  target_score    text NOT NULL DEFAULT 'C2',
  exam_date       date,
  terms_accepted_at timestamptz,
  marketing_consent boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Short-lived state for login second factor and OAuth round-trips.
CREATE TABLE auth_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('totp', 'oauth_state')),
  payload     jsonb NOT NULL DEFAULT '{}',
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

-- Thematic training answers (daily quota, statistics per skill).
CREATE TABLE practice_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill       text NOT NULL CHECK (skill IN ('CO', 'CE', 'EE', 'EO')),
  question_id text NOT NULL,
  level       text NOT NULL,
  correct     boolean,
  score       numeric,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practice_attempts_user_idx ON practice_attempts (user_id, created_at DESC);

-- Exam simulations ("ExamSessions" of the spec).
CREATE TABLE exam_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('full', 'section')),
  skills             text[] NOT NULL,
  status             text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'evaluating', 'completed', 'abandoned')),
  items              jsonb NOT NULL,                 -- { CO: [questionId…], CE: […], EE: [...], EO: [...] }
  section_index      int NOT NULL DEFAULT 0,
  section_started_at timestamptz,
  section_deadline   timestamptz,
  started_at         timestamptz,
  completed_at       timestamptz,
  scores             jsonb NOT NULL DEFAULT '{}',    -- { CO: { score, cefr, nclc }, … }
  total_score        numeric,
  fingerprint        text,
  ip                 inet,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_sessions_user_idx ON exam_sessions (user_id, created_at DESC);

CREATE TABLE exam_answers (
  session_id   uuid NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id  text NOT NULL,
  skill        text NOT NULL,
  level        text NOT NULL,
  choice       int NOT NULL,
  correct      boolean NOT NULL,
  answered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, question_id)
);

-- Single-listen enforcement: an audio can be fetched once per session.
CREATE TABLE audio_plays (
  session_id   uuid NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id  text NOT NULL,
  token        text NOT NULL,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  consumed_at  timestamptz,
  PRIMARY KEY (session_id, question_id)
);

CREATE TABLE exam_centers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  country            text NOT NULL,
  city               text NOT NULL,
  address            text,
  lat                double precision,
  lng                double precision,
  phone              text,
  email              text,
  website            text,
  booking_url        text,
  price_xaf          int,
  status             text NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed', 'full', 'soon')),
  next_session_date  date,
  seats_left         int,
  -- Legal monitoring of the public booking page (no captcha bypass, robots.txt honoured).
  watch_url          text,
  watch_open_pattern text,
  watch_full_pattern text,
  last_checked_at    timestamptz,
  last_check_result  text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_centers_country_idx ON exam_centers (country, city);

CREATE TABLE center_status_history (
  id          bigserial PRIMARY KEY,
  center_id   uuid NOT NULL REFERENCES exam_centers(id) ON DELETE CASCADE,
  previous    text,
  status      text NOT NULL,
  source      text NOT NULL CHECK (source IN ('admin', 'watcher')),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center_id        uuid NOT NULL REFERENCES exam_centers(id) ON DELETE CASCADE,
  channels         text[] NOT NULL,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  last_notified_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, center_id)
);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center_id   uuid REFERENCES exam_centers(id) ON DELETE SET NULL,
  channel     text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  url         text,
  status      text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error       text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       text NOT NULL,
  amount        int NOT NULL CHECK (amount > 0),
  currency      text NOT NULL DEFAULT 'XAF',
  method        text NOT NULL CHECK (method IN ('orange_money', 'mtn_momo', 'stripe')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  provider_ref  text,
  checkout_url  text,
  callback_token text,
  payer_phone   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz
);
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);
CREATE UNIQUE INDEX payments_provider_ref_key ON payments (method, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE candidate_vault (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  encrypted_data  text NOT NULL,
  iv              text NOT NULL,
  auth_tag        text NOT NULL,
  kms_key_id      text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Human correction (Premium Pro): writing/speaking submissions awaiting a certified teacher.
CREATE TABLE human_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  text NOT NULL UNIQUE,
  kind           text NOT NULL CHECK (kind IN ('writing', 'speaking')),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  score          numeric,
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  done_at        timestamptz
);

-- Anti-fraud: browser fingerprint and IP seen at login and when an exam starts.
CREATE TABLE fraud_signals (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint  text,
  ip           inet,
  event        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fraud_signals_fp_idx ON fraud_signals (fingerprint);

-- GDPR register of processing activities + audit trail (vault access, admin actions, account deletion).
CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid,
  actor_id    uuid,
  action      text NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}',
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  country     text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
