import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type pg from 'pg';
import { CONFIG, type Config } from '../../config.js';
import { JOBS, type Jobs } from '../../infra/jobs.js';
import { PG } from '../../infra/tokens.js';
import { CentresService, type CentreRow } from './centres.service.js';
import { detectAvailability, PoliteFetcher, type FetchLike } from './watcher.js';

@Injectable()
export class WatcherService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Watcher');
  private fetcher: PoliteFetcher;

  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(JOBS) private readonly jobs: Jobs,
    @Inject(CentresService) private readonly centres: CentresService,
  ) {
    this.fetcher = new PoliteFetcher(config.WATCHER_USER_AGENT);
  }

  async onApplicationBootstrap() {
    this.jobs.register('watcher.tick', () => this.tick());
    if (this.config.NODE_ENV !== 'test') await this.jobs.repeat('watcher.tick', this.config.WATCHER_INTERVAL_MINUTES * 60_000);
  }

  /** Test hook: swap the HTTP client. */
  useFetch(fetchImpl: FetchLike) {
    this.fetcher = new PoliteFetcher(this.config.WATCHER_USER_AGENT, fetchImpl);
  }

  async tick() {
    const { rows } = await this.pool.query<CentreRow>(`SELECT * FROM exam_centers WHERE watch_url IS NOT NULL ORDER BY last_checked_at NULLS FIRST`);
    const lastHit = new Map<string, number>();
    for (const centre of rows) {
      const host = new URL(centre.watch_url!).host;
      const wait = (lastHit.get(host) ?? 0) + 2_000 - Date.now(); // at most one request every 2 s per host
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastHit.set(host, Date.now());
      await this.check(centre);
    }
  }

  async check(centre: CentreRow) {
    let result: string;
    try {
      const page = await this.fetcher.get(centre.watch_url!);
      if (!page.allowed) result = 'robots_disallow';
      else if (page.status >= 400) result = `http_${page.status}`;
      else {
        const availability = detectAvailability(page.body, centre.watch_open_pattern, centre.watch_full_pattern);
        result = availability;
        if (availability !== 'unknown' && availability !== centre.status) await this.centres.changeStatus(centre.id, availability, 'watcher');
      }
    } catch (e) {
      result = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
    }
    await this.pool.query('UPDATE exam_centers SET last_checked_at = now(), last_check_result = $2 WHERE id = $1', [centre.id, result]);
    if (result.startsWith('error') || result === 'robots_disallow') this.logger.warn(`${centre.name}: ${result}`);
    return result;
  }
}
