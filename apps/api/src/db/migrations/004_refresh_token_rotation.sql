-- Distinguishes a refresh token replaced by rotation (reuse = theft) from one revoked by logout or a password reset.
ALTER TABLE refresh_tokens ADD COLUMN rotated boolean NOT NULL DEFAULT false;
