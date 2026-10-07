import { CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { effectivePlan, type Plan } from '@c2pass/shared';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import { CONFIG, type Config } from '../config.js';
import { PG } from '../infra/tokens.js';
import { forbidden, unauthorized } from './errors.js';

export type Role = 'student' | 'teacher' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
  planExpiresAt: string | null;
}

export interface AccessClaims {
  sub: string;
  role: Role;
}

export function signAccessToken(secret: string, claims: AccessClaims) {
  return jwt.sign(claims, secret, { expiresIn: '1h', issuer: 'c2pass' });
}

const ROLES_KEY = 'roles';
const PUBLIC_KEY = 'public';

/** Route accessible without authentication. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
});

/** Global guard: every route needs a valid bearer token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(PG) private readonly pool: pg.Pool,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      if (isPublic) return true;
      throw unauthorized();
    }
    let claims: AccessClaims;
    try {
      claims = jwt.verify(header.slice(7), this.config.JWT_SECRET, { issuer: 'c2pass' }) as AccessClaims;
    } catch {
      if (isPublic) return true;
      throw unauthorized('Session expirée');
    }
    const { rows: [u] } = await this.pool.query<{ id: string; email: string; role: Role; status: string; plan_id: string; plan_expires_at: Date | null }>(
      `UPDATE users SET last_seen_at = now() WHERE id = $1 RETURNING id, email, role, status, plan_id, plan_expires_at`,
      [claims.sub],
    );
    if (!u || u.status !== 'active') throw unauthorized('Compte inactif');
    req.user = {
      id: u.id,
      email: u.email,
      role: u.role,
      plan: effectivePlan(u.plan_id, u.plan_expires_at),
      planExpiresAt: u.plan_expires_at?.toISOString() ?? null,
    };
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(u.role)) throw forbidden();
    return true;
  }
}

export function clientIp(req: Request): string | null {
  const ip = req.ip ?? null;
  return ip?.startsWith('::ffff:') ? ip.slice(7) : ip;
}
