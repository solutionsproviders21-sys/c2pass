import { HttpException } from '@nestjs/common';

/** Domain error with a stable machine-readable code, rendered as `{ error: { code, message, details } }`. */
export class AppError extends HttpException {
  constructor(status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super({ error: { code, message, details } }, status);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentification requise') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Accès refusé') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'Ressource') => new AppError(404, 'not_found', `${what} introuvable`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
/** The user's plan does not include this feature or its quota is exhausted. */
export const upgradeRequired = (code: string, message: string, details?: unknown) => new AppError(402, code, message, details);
