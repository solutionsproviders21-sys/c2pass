import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Port for binary files (exam audio, candidate recordings). Local disk in dev, S3-compatible storage in production. */
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

/** S3-compatible object storage (AWS S3, SeaweedFS, Cloudflare R2). Objects stay private. */
export class S3Storage implements Storage {
  private readonly client: S3Client;

  constructor(private readonly bucket: string, opts: { endpoint?: string; region: string; accessKeyId?: string; secretAccessKey?: string }) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: !!opts.endpoint, // self-hosted S3
      credentials: opts.accessKeyId && opts.secretAccessKey ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } : undefined,
    });
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType, ServerSideEncryption: 'AES256' }));
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return { data: Buffer.from(bytes), contentType: res.ContentType ?? 'application/octet-stream' };
    } catch (e) {
      if (e instanceof NoSuchKey || (e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }
}

export const STORAGE = Symbol('STORAGE');
