/**
 * Creates the first administrator on a production server (the demo accounts are not created there).
 * Usage: node dist/db/create-admin.js <email> <prénom> <nom>
 * Prints a one-time random password, unless ADMIN_PASSWORD (12 characters or more) is set: the installer
 * (ops/install.sh) passes the password the owner chose, and it is never printed.
 * The TOTP second factor is set up at the first login.
 */
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { loadConfig } from '../config.js';
import { createPool } from '../infra/database.js';
import { migrate } from './migrate.js';

const [email, firstName, lastName] = process.argv.slice(2);
if (!email?.includes('@') || !firstName || !lastName) {
  console.error('Usage : node dist/db/create-admin.js <email> <prénom> <nom>');
  process.exit(1);
}

const pool = createPool(loadConfig().DATABASE_URL);
try {
  await migrate(pool);
  const chosen = process.env.ADMIN_PASSWORD;
  if (chosen !== undefined && chosen.length < 12) throw new Error('ADMIN_PASSWORD : 12 caractères minimum.');
  const password = chosen ?? randomBytes(18).toString('base64url');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const { rows: [u] } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, email_verified_at) VALUES (lower($1), $2, 'admin', now())
     ON CONFLICT (lower(email)) WHERE status <> 'deleted' DO NOTHING RETURNING id`,
    [email.trim(), hash],
  );
  if (!u) {
    console.error(`Un compte existe déjà pour ${email}. Changez son rôle depuis le back-office d’un administrateur existant.`);
    process.exitCode = 1;
  } else {
    await pool.query(`INSERT INTO profiles (user_id, first_name, last_name, terms_accepted_at) VALUES ($1, $2, $3, now())`, [u.id, firstName, lastName]);
    await pool.query(`INSERT INTO audit_logs (user_id, action, meta) VALUES ($1, 'admin.created_from_cli', '{}')`, [u.id]);
    console.log(`Administrateur créé : ${email}`);
    if (!chosen) console.log(`Mot de passe provisoire (affiché une seule fois) : ${password}`);
    console.log('À la première connexion, la double authentification (TOTP) sera configurée ; changez ensuite le mot de passe dans le profil.');
  }
} finally {
  await pool.end();
}
