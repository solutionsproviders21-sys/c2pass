import type { z } from 'zod';

/** Parses a request payload; a ZodError becomes a 400 in AllExceptionsFilter. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}
