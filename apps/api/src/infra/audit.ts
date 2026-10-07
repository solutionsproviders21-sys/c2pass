import type { Queryable } from './database.js';

export async function audit(db: Queryable, entry: { userId?: string | null; actorId?: string | null; action: string; meta?: unknown; ip?: string | null }) {
  await db.query('INSERT INTO audit_logs (user_id, actor_id, action, meta, ip) VALUES ($1, $2, $3, $4, $5)', [
    entry.userId ?? null, entry.actorId ?? null, entry.action, JSON.stringify(entry.meta ?? {}), entry.ip ?? null,
  ]);
}
