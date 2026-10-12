import { Logger } from '@nestjs/common';
import type pg from 'pg';
import webpush from 'web-push';
import type { Config } from '../config.js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Sends an already-encrypted Web Push request; returns the push service's HTTP status. Swappable in tests. */
export type PushTransport = (req: { endpoint: string; method: string; headers: Record<string, string>; body: Buffer | null }) => Promise<number>;

const fetchTransport: PushTransport = async ({ endpoint, method, headers, body }) =>
  (await fetch(endpoint, { method, headers, body: body ? new Uint8Array(body) : undefined })).status;

/**
 * Push services run by browser vendors. Subscriptions pointing anywhere else are refused,
 * so the API can never be used to send requests to arbitrary hosts.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', '.notify.windows.com', '.push.apple.com'];

export function isAllowedPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port) return false;
  return PUSH_HOSTS.some((h) => (h.startsWith('.') ? url.hostname.endsWith(h) : url.hostname === h));
}

/** Web Push with VAPID. Disabled (no-op) until VAPID keys are configured. */
export class PushService {
  private readonly logger = new Logger('Push');
  private readonly vapid: { subject: string; publicKey: string; privateKey: string } | null;

  constructor(private readonly pool: pg.Pool, cfg: Config, private readonly transport: PushTransport = fetchTransport) {
    this.vapid = cfg.VAPID_PUBLIC_KEY && cfg.VAPID_PRIVATE_KEY
      ? { subject: cfg.VAPID_SUBJECT, publicKey: cfg.VAPID_PUBLIC_KEY, privateKey: cfg.VAPID_PRIVATE_KEY }
      : null;
  }

  get publicKey() {
    return this.vapid?.publicKey ?? null;
  }

  async subscribe(userId: string, sub: PushSubscriptionInput, userAgent?: string) {
    // An endpoint belongs to one browser; if another account used this browser before, it moves to the current one.
    await this.pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
      [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 300) ?? null],
    );
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
  }

  /** Best effort: a failing device never blocks the other channels. Returns how many devices accepted the message. */
  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.vapid) return 0;
    const { rows } = await this.pool.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId],
    );
    let delivered = 0;
    for (const s of rows) {
      try {
        const req = webpush.generateRequestDetails(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { vapidDetails: this.vapid, TTL: 6 * 3600, urgency: 'high' },
        );
        const status = await this.transport({ endpoint: req.endpoint, method: req.method, headers: req.headers, body: req.body });
        if (status === 404 || status === 410) {
          // The browser revoked this subscription (uninstalled, permission withdrawn).
          await this.pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
        } else if (status >= 200 && status < 300) {
          delivered++;
          await this.pool.query('UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1', [s.id]);
        } else {
          this.logger.warn(`push to ${new URL(s.endpoint).hostname} failed (${status})`);
        }
      } catch (e) {
        this.logger.warn(`push failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return delivered;
  }
}

export const PUSH = Symbol('PUSH');
