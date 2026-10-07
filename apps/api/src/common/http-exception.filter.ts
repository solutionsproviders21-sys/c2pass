import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ZodError) {
      res.status(400).json({ error: { code: 'validation_failed', message: 'Données invalides', details: exception.issues } });
      return;
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const status = exception.getStatus();
      if (typeof body === 'object' && body && 'error' in body) res.status(status).json(body);
      else res.status(status).json({ error: { code: httpCode(status), message: exception.message } });
      return;
    }
    if (isPgUniqueViolation(exception)) {
      res.status(409).json({ error: { code: 'already_exists', message: 'Cette ressource existe déjà' } });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ error: { code: 'internal_error', message: 'Erreur interne' } });
  }
}

function httpCode(status: number) {
  return ({ 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 413: 'payload_too_large', 429: 'too_many_requests' } as Record<number, string>)[status] ?? 'error';
}

function isPgUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}
