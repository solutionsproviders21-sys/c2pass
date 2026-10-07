import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SKILLS } from '@c2pass/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { clientIp, CurrentUser, Public, type AuthUser } from '../../common/auth.js';
import { badRequest, AppError } from '../../common/errors.js';
import { STORAGE, type Storage } from '../../infra/storage.js';
import { SimulatorService } from './simulator.service.js';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/** Simulateur d'examen en conditions réelles (module 1.C, endpoints §6.1). */
@Controller('simulator/sessions')
export class SimulatorController {
  constructor(
    @Inject(SimulatorService) private readonly simulator: SimulatorService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({ type: z.enum(['full', 'section']), skill: z.enum(SKILLS).optional() }).parse(body);
    const s = await this.simulator.create(user.id, user.plan, b);
    return this.simulator.state(user.id, s.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.simulator.list(user.id);
  }

  @Get(':id')
  state(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.simulator.state(user.id, id);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = z.object({ fingerprint: z.string().max(128).optional() }).parse(body ?? {});
    return this.simulator.start(user.id, id, { fingerprint: b.fingerprint, ip: clientIp(req) });
  }

  @Post(':id/answers')
  answer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ questionId: z.string().min(1), choice: z.number().int().min(0).max(3) }).parse(body);
    return this.simulator.answer(user.id, id, b.questionId, b.choice);
  }

  @Post(':id/play/:questionId')
  @HttpCode(200)
  play(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('questionId') questionId: string) {
    return this.simulator.play(user.id, id, questionId);
  }

  /** One-time audio URL (an <audio> element cannot send the bearer token). */
  @Public()
  @Get(':id/audio/:questionId')
  async audio(@Param('id') id: string, @Param('questionId') questionId: string, @Query('token') token: string | undefined, @Res() res: Response) {
    if (!token || !/^[0-9a-f-]{36}$/i.test(id)) throw badRequest('token_required', 'Lien d’écoute invalide');
    const key = await this.simulator.consumeAudio(id, questionId, token);
    const file = key ? await this.storage.get(key) : null;
    if (!file) throw new AppError(410, 'already_played', 'Écoute unique : ce document a déjà été diffusé');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.data);
  }

  @Put(':id/writing/:questionId')
  writing(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('questionId') questionId: string, @Body() body: unknown) {
    const { text } = z.object({ text: z.string().max(8_000) }).parse(body);
    return this.simulator.saveWriting(user.id, user.plan, id, questionId, text);
  }

  /** POST /simulator/sessions/:id/audio — multipart upload of the WebRTC (MediaRecorder) recording. */
  @Post(':id/audio')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  recording(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, string>) {
    const b = z.object({ questionId: z.string().min(1), duration: z.coerce.number().optional() }).parse(body);
    if (!file?.buffer?.length) throw badRequest('audio_required', 'Enregistrement audio manquant');
    if (!file.mimetype.startsWith('audio/') && file.mimetype !== 'video/webm') throw badRequest('invalid_audio', 'Format audio non pris en charge');
    return this.simulator.saveRecording(user.id, user.plan, id, b.questionId, { data: file.buffer, contentType: file.mimetype, duration: b.duration ?? null });
  }

  @Post(':id/next')
  @HttpCode(200)
  next(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { index } = z.object({ index: z.number().int().min(0) }).parse(body);
    return this.simulator.nextSection(user.id, id, index);
  }

  @Post(':id/abandon')
  @HttpCode(204)
  async abandon(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.simulator.abandon(user.id, id);
  }

  /** Anti-fraud telemetry from the exam page: focus lost, copy attempts, fullscreen exit. */
  @Post(':id/events')
  @HttpCode(204)
  async event(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = z.object({ type: z.enum(['blur', 'copy', 'paste', 'contextmenu', 'fullscreen_exit']), fingerprint: z.string().max(128).optional() }).parse(body);
    await this.simulator.recordEvent(user.id, id, b.type, { fingerprint: b.fingerprint, ip: clientIp(req) });
  }

  @Get(':id/result')
  result(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.simulator.result(user.id, id);
  }
}
