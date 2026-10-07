import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpCode } from '../src/infra/crypto.js';
import { adminToken, auth, createTestApp, newStudent, setPlan, teacherToken, type TestContext } from './helpers.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.app.close();
});

describe('authentication', () => {
  it('registers, logs in, rotates refresh tokens and returns the profile', async () => {
    const s = await newStudent(ctx);
    const me = await ctx.http.get('/api/me').set(auth(s.token));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: s.email, role: 'student', firstName: 'Awa', plan: { id: 'free' } });

    const login = await ctx.http.post('/api/auth/login').send({ email: s.email.toUpperCase(), password: 'MotDePasse123' });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();

    const wrong = await ctx.http.post('/api/auth/login').send({ email: s.email, password: 'nope' });
    expect(wrong.status).toBe(401);

    const r1 = await ctx.http.post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    const reused = await ctx.http.post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(reused.status).toBe(401);
  });

  it('requires accepting the terms and refuses duplicate emails', async () => {
    const s = await newStudent(ctx);
    const dup = await ctx.http.post('/api/auth/register').send({ email: s.email, password: 'MotDePasse123', firstName: 'A', lastName: 'B', acceptTerms: true });
    expect(dup.status).toBe(409);
    const noTerms = await ctx.http.post('/api/auth/register').send({ email: 'x@test.cm', password: 'MotDePasse123', firstName: 'A', lastName: 'B' });
    expect(noTerms.status).toBe(400);
  });

  it('forces TOTP enrolment for administrators, then requires the code', async () => {
    const first = await ctx.http.post('/api/auth/login').send({ email: 'admin@c2pass.cm', password: 'Demo1234!' });
    expect(first.body.totpSetupRequired).toBe(true);
    expect(first.body.accessToken).toBeUndefined();
    const bad = await ctx.http.post('/api/auth/totp/verify').send({ challengeId: first.body.challengeId, code: '000000' });
    expect(bad.status).toBe(401);
    const ok = await ctx.http.post('/api/auth/totp/verify').send({ challengeId: first.body.challengeId, code: totpCode(first.body.secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();

    const second = await ctx.http.post('/api/auth/login').send({ email: 'admin@c2pass.cm', password: 'Demo1234!' });
    expect(second.body.totpRequired).toBe(true);
    const verified = await ctx.http.post('/api/auth/totp/verify').send({ challengeId: second.body.challengeId, code: totpCode(first.body.secret) });
    expect(verified.status).toBe(200);
  });

  it('protects admin routes', async () => {
    const s = await newStudent(ctx);
    expect((await ctx.http.get('/api/admin/stats').set(auth(s.token))).status).toBe(403);
    expect((await ctx.http.get('/api/admin/stats')).status).toBe(401);
    const stats = await ctx.http.get('/api/admin/stats').set(auth(await adminToken(ctx)));
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveProperty('mrr');
  });
});

describe('training mode', () => {
  it('corrects an MCQ and enforces the free plan limit of 5 exercises a day', async () => {
    const s = await newStudent(ctx);
    for (let i = 0; i < 5; i++) {
      const q = await ctx.http.get('/api/training/CE/question').set(auth(s.token));
      expect(q.status).toBe(200);
      expect(q.body.correctAnswer).toBeUndefined();
      const a = await ctx.http.post('/api/training/answer').set(auth(s.token)).send({ questionId: q.body.id, choice: 0 });
      expect(a.status).toBe(201);
      expect(typeof a.body.correct).toBe('boolean');
      expect(a.body.explanation).toBeTruthy();
    }
    const blocked = await ctx.http.get('/api/training/CE/question').set(auth(s.token));
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe('daily_limit_reached');
  });

  it('reveals the CO transcript only after answering', async () => {
    const s = await newStudent(ctx);
    const q = await ctx.http.get('/api/training/CO/question').set(auth(s.token));
    expect(q.body.context).toBeNull();
    expect(JSON.stringify(q.body)).not.toContain('transcript');
    const a = await ctx.http.post('/api/training/answer').set(auth(s.token)).send({ questionId: q.body.id, choice: 1 });
    expect(a.body.transcript).toBeTruthy();
  });

  it('evaluates a writing with C2 metrics', async () => {
    const s = await newStudent(ctx);
    await setPlan(ctx, s.id, 'standard');
    const text = `Le télétravail généralisé constitue certes une avancée ; nonobstant, il n'en demeure pas moins qu'il fragilise le lien social.
      Bien que les outils numériques permettent des échanges constants, ils ne sauraient remplacer les rencontres fortuites, lesquelles nourrissent la confiance.
      Par voie de conséquence, il est indispensable que les entreprises repensent leurs rituels collectifs afin que chacun conserve un sentiment d'appartenance.
      En définitive, le télétravail n'est ni une menace ni une panacée : tout dépend de la manière dont il est organisé et accompagné.`;
    const r = await ctx.http.post('/api/training/writing').set(auth(s.token)).send({ questionId: 'EE-S1-T3', text });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('done');
    expect(r.body.score).toBeGreaterThanOrEqual(10);
    expect(r.body.feedback.strengths.length).toBeGreaterThan(0);
    expect(r.body.metrics.advancedConnectors).toEqual(expect.arrayContaining(['nonobstant', 'par voie de conséquence']));
  });
});

describe('exam simulator', () => {
  it('runs a full simulation under exam conditions and scores it', async () => {
    const s = await newStudent(ctx);
    const created = await ctx.http.post('/api/simulator/sessions').set(auth(s.token)).send({ type: 'full' });
    expect(created.status).toBe(201);
    expect(created.body.sections.map((x: { skill: string; items: number }) => [x.skill, x.items])).toEqual([['CO', 39], ['CE', 39], ['EE', 3], ['EO', 3]]);
    const id = created.body.id;

    // Free plan: one full simulation per month.
    const second = await ctx.http.post('/api/simulator/sessions').set(auth(s.token)).send({ type: 'full' });
    expect(second.status).toBe(402);

    const started = await ctx.http.post(`/api/simulator/sessions/${id}/start`).set(auth(s.token)).send({ fingerprint: 'fp-test' });
    expect(started.body.status).toBe('in_progress');
    expect(started.body.current.skill).toBe('CO');
    expect(started.body.current.remainingSeconds).toBeGreaterThan(35 * 60 - 5);
    const co = started.body.current.questions;
    expect(co).toHaveLength(39);
    expect(JSON.stringify(co)).not.toMatch(/correctAnswer|transcript|explanation/);
    expect(co[0].level).toBe('A1');
    expect(co[38].level).toBe('C2');
    expect((await ctx.http.post(`/api/simulator/sessions/${id}/start`).set(auth(s.token)).send({})).status).toBe(409);

    // Single listen.
    const play = await ctx.http.post(`/api/simulator/sessions/${id}/play/${co[0].id}`).set(auth(s.token));
    expect(play.status).toBe(200);
    expect(play.body.tts).toBeTruthy();
    expect((await ctx.http.post(`/api/simulator/sessions/${id}/play/${co[0].id}`).set(auth(s.token))).status).toBe(409);

    // One answer per question, no going back.
    expect((await ctx.http.post(`/api/simulator/sessions/${id}/answers`).set(auth(s.token)).send({ questionId: co[0].id, choice: 1 })).status).toBe(201);
    expect((await ctx.http.post(`/api/simulator/sessions/${id}/answers`).set(auth(s.token)).send({ questionId: co[0].id, choice: 2 })).status).toBe(409);

    // Correct answers for the rest of CO, read from the bank (the client never sees them).
    const bank = await ctx.mongo.collection('questions').find({ _id: { $in: co.slice(1).map((q: { id: string }) => q.id) } }).toArray();
    for (const q of bank) {
      await ctx.http.post(`/api/simulator/sessions/${id}/answers`).set(auth(s.token)).send({ questionId: q._id, choice: q.correctAnswer });
    }

    // Writing during CO is refused.
    expect((await ctx.http.put(`/api/simulator/sessions/${id}/writing/EE-S1-T1`).set(auth(s.token)).send({ text: 'x' })).status).toBe(409);

    // Time lock: once the CE deadline is over, answers are refused and the exam moves on by itself.
    const ce = await ctx.http.post(`/api/simulator/sessions/${id}/next`).set(auth(s.token)).send({ index: 0 });
    expect(ce.body.current.skill).toBe('CE');
    expect(ce.body.sections[0].state).toBe('done');
    await ctx.pool.query(`UPDATE exam_sessions SET section_deadline = now() - interval '1 minute' WHERE id = $1`, [id]);
    const late = await ctx.http.post(`/api/simulator/sessions/${id}/answers`).set(auth(s.token)).send({ questionId: ce.body.current.questions[0].id, choice: 0 });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('section_time_over');

    const ee = await ctx.http.get(`/api/simulator/sessions/${id}`).set(auth(s.token));
    expect(ee.body.current.skill).toBe('EE');
    const tasks = ee.body.current.questions;
    expect(tasks.map((t: { task: number }) => t.task)).toEqual([1, 2, 3]);
    const text = 'Certes, le sujet est complexe ; néanmoins, il me semble indispensable que chacun puisse exprimer son point de vue, bien que les avis divergent. Par conséquent, je propose une solution équilibrée.';
    for (const t of tasks.slice(0, 2)) {
      expect((await ctx.http.put(`/api/simulator/sessions/${id}/writing/${t.id}`).set(auth(s.token)).send({ text })).status).toBe(200);
    }
    const eo = await ctx.http.post(`/api/simulator/sessions/${id}/next`).set(auth(s.token)).send({ index: 2 });
    expect(eo.body.current.skill).toBe('EO');
    const upload = await ctx.http.post(`/api/simulator/sessions/${id}/audio`).set(auth(s.token))
      .field('questionId', eo.body.current.questions[0].id).field('duration', '95')
      .attach('audio', Buffer.from('fake-webm-audio'), { filename: 'rec.webm', contentType: 'audio/webm' });
    expect(upload.status).toBe(201);
    const done = await ctx.http.post(`/api/simulator/sessions/${id}/next`).set(auth(s.token)).send({ index: 3 });
    expect(done.body.status).toBe('completed');

    const result = await ctx.http.get(`/api/simulator/sessions/${id}/result`).set(auth(s.token));
    expect(result.status).toBe(200);
    // 38 correct out of 39 CO answers: C2 range. CE left unanswered: floor of the scale.
    expect(result.body.scores.CO.score).toBeGreaterThanOrEqual(600);
    expect(result.body.scores.CO.cefr).toBe('C2');
    expect(result.body.scores.CO.nclc).toBe(10);
    expect(result.body.scores.CE.score).toBe(100);
    expect(result.body.scores.EE.score).toBeGreaterThan(0);
    expect(result.body.scores.EO).toMatchObject({ score: null }); // no speech recognition configured
    expect(result.body.review.CO[0]).toMatchObject({ choice: 1, correctAnswer: expect.any(Number), transcript: expect.any(String) });
    expect(result.body.review.EE[2].status).toBe('missing');

    const dashboard = await ctx.http.get('/api/dashboard').set(auth(s.token));
    expect(dashboard.body.skills.find((k: { skill: string }) => k.skill === 'CO').cefr).toBe('C2');
  });
});

describe('payments', () => {
  it('activates a plan after a Mobile Money payment (sandbox) and reports failures', async () => {
    const s = await newStudent(ctx);
    const ok = await ctx.http.post('/api/payments/checkout').set(auth(s.token)).send({ planId: 'standard', method: 'mtn_momo', phone: '+237 670 00 00 01' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'succeeded', amount: 9900, currency: 'XAF' });
    const me = await ctx.http.get('/api/me').set(auth(s.token));
    expect(me.body.plan.id).toBe('standard');

    const ko = await ctx.http.post('/api/payments/checkout').set(auth(s.token)).send({ planId: 'pro', method: 'orange_money', phone: '+237 690 00 0000' });
    expect(ko.body.status).toBe('failed');
    expect((await ctx.http.get('/api/me').set(auth(s.token))).body.plan.id).toBe('standard');

    const pack = await ctx.http.post('/api/payments/checkout').set(auth(s.token)).send({ planId: 'reussite', method: 'orange_money', phone: '+237 690 00 0001' });
    expect(pack.body.amount).toBe(49900);
    const after = await ctx.http.get('/api/me').set(auth(s.token));
    expect(after.body.plan.id).toBe('reussite');
    expect(after.body.c2GuaranteeUntil).toBeTruthy();
  });
});

describe('centres and real-time alerts', () => {
  it('lists centres publicly and keeps alerts for paying plans', async () => {
    const list = await ctx.http.get('/api/centres?country=CM');
    expect(list.status).toBe(200);
    expect(list.body.every((c: { country: string }) => c.country === 'CM')).toBe(true);
    expect(list.body[0]).not.toHaveProperty('watchUrl');

    const s = await newStudent(ctx);
    const blocked = await ctx.http.post('/api/alerts/subscribe').set(auth(s.token)).send({ centreId: list.body[0].id, channels: ['email'] });
    expect(blocked.status).toBe(402);
  });

  it('alerts subscribers on every channel when an admin opens a centre, priority plans first, without duplicates', async () => {
    const centres = (await ctx.http.get('/api/centres?status=full')).body;
    const centre = centres[0];
    const standard = await newStudent(ctx);
    const pro = await newStudent(ctx);
    await setPlan(ctx, standard.id, 'standard');
    await setPlan(ctx, pro.id, 'pro');
    expect((await ctx.http.post('/api/alerts/subscribe').set(auth(standard.token)).send({ centreId: centre.id, channels: ['email'] })).status).toBe(201);
    expect((await ctx.http.post('/api/alerts/subscribe').set(auth(pro.token)).send({ centreId: centre.id, channels: ['email', 'sms', 'whatsapp'] })).status).toBe(201);

    ctx.notifier.sent.length = 0;
    const admin = await adminToken(ctx);
    const r = await ctx.http.patch(`/api/centres/${centre.id}/status`).set(auth(admin)).send({ status: 'open', seatsLeft: 2 });
    expect(r.status).toBe(200);
    const proMsgs = ctx.notifier.sent.filter((m) => m.to === pro.email || m.to.replace(/\s/g, '') === '+237690112233');
    expect(new Set(ctx.notifier.sent.map((m) => m.channel))).toEqual(new Set(['email', 'sms', 'whatsapp', 'push']));
    expect(proMsgs.length).toBeGreaterThan(0);
    // Pro (priority) is served before Standard.
    const firstStandard = ctx.notifier.sent.findIndex((m) => m.to === standard.email);
    const firstPro = ctx.notifier.sent.findIndex((m) => m.to === pro.email);
    expect(firstPro).toBeLessThan(firstStandard);

    const inbox = await ctx.http.get('/api/notifications').set(auth(standard.token));
    expect(inbox.body[0].title).toContain('places TCF Canada');

    // Closing and reopening right away does not spam the same subscribers.
    ctx.notifier.sent.length = 0;
    await ctx.http.patch(`/api/centres/${centre.id}/status`).set(auth(admin)).send({ status: 'full' });
    await ctx.http.patch(`/api/centres/${centre.id}/status`).set(auth(admin)).send({ status: 'open' });
    expect(ctx.notifier.sent.filter((m) => m.to === pro.email || m.to === standard.email)).toHaveLength(0);
  });

  it('caps the number of watched centres for Premium Standard', async () => {
    const s = await newStudent(ctx);
    await setPlan(ctx, s.id, 'standard');
    const centres = (await ctx.http.get('/api/centres')).body;
    for (const c of centres.slice(0, 3)) {
      expect((await ctx.http.post('/api/alerts/subscribe').set(auth(s.token)).send({ centreId: c.id, channels: ['email'] })).status).toBe(201);
    }
    const fourth = await ctx.http.post('/api/alerts/subscribe').set(auth(s.token)).send({ centreId: centres[3].id, channels: ['email'] });
    expect(fourth.status).toBe(402);
    expect(fourth.body.error.code).toBe('alert_limit_reached');
  });

  it('legal watcher honours robots.txt and detects availability from the public page', async () => {
    const { WatcherService } = await import('../src/modules/centres/watcher.service.js');
    const watcher = ctx.app.get(WatcherService);
    const admin = await adminToken(ctx);
    const centre = (await ctx.http.post('/api/centres').set(auth(admin)).send({
      name: 'Centre test veille', country: 'TD', city: 'Moundou', status: 'full',
      watchUrl: 'https://centre.example/tcf/inscriptions', watchOpenPattern: 'inscriptions? (sont )?ouvertes', watchFullPattern: 'complet',
    })).body;

    const requested: string[] = [];
    let page = '<h1>TCF Canada</h1><p>Session de juin : COMPLET</p>';
    let robots = 'User-agent: *\nDisallow: /tcf/';
    watcher.useFetch(async (url) => {
      requested.push(url);
      if (url.endsWith('/robots.txt')) return { ok: true, status: 200, text: async () => robots };
      return { ok: true, status: 200, text: async () => page };
    });

    let r = await ctx.http.post(`/api/centres/${centre.id}/check`).set(auth(admin));
    expect(r.body.result).toBe('robots_disallow');
    expect(requested).toEqual(['https://centre.example/robots.txt']);

    robots = 'User-agent: *\nDisallow: /admin/';
    watcher.useFetch(async (url) => {
      requested.push(url);
      if (url.endsWith('/robots.txt')) return { ok: true, status: 200, text: async () => robots };
      return { ok: true, status: 200, text: async () => page };
    });
    r = await ctx.http.post(`/api/centres/${centre.id}/check`).set(auth(admin));
    expect(r.body.result).toBe('full');

    page = '<p>Les inscriptions sont ouvertes pour la session du 22 juin.</p>';
    r = await ctx.http.post(`/api/centres/${centre.id}/check`).set(auth(admin));
    expect(r.body.result).toBe('open');
    expect((await ctx.http.get(`/api/centres/${centre.id}`)).body.status).toBe('open');
    const history = await ctx.http.get(`/api/centres/${centre.id}/history`).set(auth(admin));
    expect(history.body[0]).toMatchObject({ previous: 'full', status: 'open', source: 'watcher' });
  });
});

describe('vault and GDPR', () => {
  it('stores the candidate file encrypted (AES-256-GCM)', async () => {
    const s = await newStudent(ctx);
    const put = await ctx.http.put('/api/me/vault').set(auth(s.token)).send({ lastName: 'KAMGA', firstName: 'Alexandre', passportNumber: 'P01234567' });
    expect(put.status).toBe(200);
    const { rows: [row] } = await ctx.pool.query('SELECT encrypted_data, kms_key_id FROM candidate_vault WHERE user_id = $1', [s.id]);
    expect(row.encrypted_data).not.toContain('P01234567');
    expect(row.kms_key_id).toBeTruthy();
    const get = await ctx.http.get('/api/me/vault').set(auth(s.token));
    expect(get.body.data.passportNumber).toBe('P01234567');
  });

  it('exports all personal data and erases the account', async () => {
    const s = await newStudent(ctx);
    await ctx.http.put('/api/me/vault').set(auth(s.token)).send({ passportNumber: 'P999' });
    const exp = await ctx.http.get('/api/me/export').set(auth(s.token));
    expect(exp.status).toBe(200);
    expect(exp.body.account.email).toBe(s.email);
    expect(exp.body.vault.passportNumber).toBe('P999');

    expect((await ctx.http.delete('/api/me').set(auth(s.token))).status).toBe(204);
    expect((await ctx.http.post('/api/auth/login').send({ email: s.email, password: 'MotDePasse123' })).status).toBe(401);
    expect((await ctx.http.get('/api/me').set(auth(s.token))).status).toBe(401);
    const { rows } = await ctx.pool.query('SELECT 1 FROM candidate_vault WHERE user_id = $1', [s.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('human correction (Premium Pro)', () => {
  it('queues a Pro writing for a teacher and returns the grade', async () => {
    const s = await newStudent(ctx);
    await setPlan(ctx, s.id, 'pro');
    const sub = await ctx.http.post('/api/training/writing').set(auth(s.token)).send({ questionId: 'EE-S2-T3', text: 'Les réseaux sociaux ont transformé le débat public, certes, mais ils enferment aussi chacun dans ses convictions.', humanReview: true });
    expect(sub.status).toBe(201);
    const teacher = await teacherToken(ctx);
    const pending = await ctx.http.get('/api/reviews').set(auth(teacher));
    const review = pending.body.find((r: { submissionId: string }) => r.submissionId === sub.body.id);
    expect(review).toBeTruthy();
    const detail = await ctx.http.get(`/api/reviews/${review.id}`).set(auth(teacher));
    expect(detail.body.submission.text).toContain('réseaux sociaux');
    expect((await ctx.http.post(`/api/reviews/${review.id}`).set(auth(teacher)).send({ score: 9, comment: 'Argumentation trop courte : développez les deux points de vue.' })).status).toBe(201);
    const after = await ctx.http.get(`/api/training/submissions/${sub.body.id}`).set(auth(s.token));
    expect(after.body.humanReview).toMatchObject({ score: 9 });

    const free = await newStudent(ctx);
    const refused = await ctx.http.post('/api/training/writing').set(auth(free.token)).send({ questionId: 'EE-S2-T3', text: 'Texte', humanReview: true });
    expect(refused.status).toBe(402);
  });
});
