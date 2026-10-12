import { z } from 'zod';

const optional = z.string().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://c2pass:c2pass@localhost:5432/c2pass_tcf'),
  MONGO_URL: z.string().default('mongodb://localhost:27017'),
  MONGO_DB: z.string().default('c2pass'),
  /** Without Redis, background jobs (AI evaluation, alerts, watcher) run inline in the API process. */
  REDIS_URL: optional,
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me'),
  /** 32-byte key, base64. Encrypts the candidate vault and TOTP secrets (AES-256-GCM). */
  VAULT_KEY: z.string().default('ZGV2LW9ubHktdmF1bHQta2V5LWNoYW5nZS1tZS0zMmI='),
  VAULT_KEY_ID: z.string().default('local-v1'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  STORAGE_DIR: z.string().default('./storage'),
  S3_BUCKET: optional,
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,

  OPENAI_API_KEY: optional,
  OPENAI_MODEL: z.string().default('gpt-4-turbo'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  LANGUAGETOOL_URL: optional,
  TEXTRAZOR_API_KEY: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  FACEBOOK_APP_ID: optional,
  FACEBOOK_APP_SECRET: optional,

  NOTIFICATIONS_MODE: z.enum(['console', 'live']).default('console'),
  SMTP_URL: optional,
  MAIL_FROM: z.string().default('C2Pass <alertes@c2pass.cm>'),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM: optional,
  WHATSAPP_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  /** Web Push (alerts on phones and computers, even with the site closed). Generate with: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: z.string().default('mailto:alertes@c2pass.cm'),

  PAYMENTS_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  /** In production, sandbox payments (plans activated without paying) need this explicit opt-in. Demo servers only. */
  ALLOW_SANDBOX_PAYMENTS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  PAYMENTS_WEBHOOK_SECRET: optional,
  ORANGE_MONEY_BASE_URL: z.string().default('https://api.orange.com'),
  ORANGE_MONEY_CLIENT_ID: optional,
  ORANGE_MONEY_CLIENT_SECRET: optional,
  ORANGE_MONEY_MERCHANT_KEY: optional,
  MTN_MOMO_BASE_URL: z.string().default('https://sandbox.momodeveloper.mtn.com'),
  MTN_MOMO_TARGET_ENV: z.string().default('sandbox'),
  MTN_MOMO_SUBSCRIPTION_KEY: optional,
  MTN_MOMO_API_USER: optional,
  MTN_MOMO_API_KEY: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,

  WATCHER_INTERVAL_MINUTES: z.coerce.number().min(5).max(60).default(7),
  WATCHER_USER_AGENT: z.string().default('C2PassVeille/1.0 (+https://c2pass.cm/veille)'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(env);
  if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET.startsWith('dev-only')) throw new Error('JWT_SECRET must be set in production');
    if (config.VAULT_KEY === schema.shape.VAULT_KEY.parse(undefined)) throw new Error('VAULT_KEY must be set in production');
    if (config.PAYMENTS_MODE !== 'live' && !config.ALLOW_SANDBOX_PAYMENTS) {
      throw new Error('PAYMENTS_MODE=sandbox activates plans without payment: set PAYMENTS_MODE=live, or ALLOW_SANDBOX_PAYMENTS=true on a demo server');
    }
  }
  if (Buffer.from(config.VAULT_KEY, 'base64').length !== 32) throw new Error('VAULT_KEY must be 32 bytes, base64-encoded');
  return config;
}

export const CONFIG = Symbol('CONFIG');
