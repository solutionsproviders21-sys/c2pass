import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

/** Port for binary files (exam audio, candidate recordings). Local disk in dev, S3/MinIO in production. */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
}

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private path(key: string) {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root))) throw new Error('Invalid storage key');
    return p;
  }

  async put(key: string, data: Buffer, contentType: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    await writeFile(`${p}.type`, contentType);
  }

  async get(key: string) {
    const p = this.path(key);
    try {
      await stat(p);
    } catch {
      return null;
    }
    const contentType = await readFile(`${p}.type`, 'utf8').catch(() => 'application/octet-stream');
    return { data: await readFile(p), contentType };
  }
}

export const STORAGE = Symbol('STORAGE');
