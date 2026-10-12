import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { clientIp, CurrentUser, Public, type AuthUser } from '../../common/auth.js';
import { badRequest, unauthorized } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { AuthService, type Tokens } from './auth.service.js';
import { OAuthClient, type OAuthProvider } from './oauth.js';

const password = z.string().min(8, 'Au moins 8 caractères').max(200);

const registerSchema = z.object({
  email: z.email(),
  password,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  country: z.string().max(2).optional(),
  city: z.string().max(80).optional(),
  phone: z.string().regex(/^\+?[0-9 ]{8,20}$/).optional(),
  acceptTerms: z.literal(true, { error: 'Vous devez accepter les conditions et la politique de confidentialité' }),
  marketingConsent: z.boolean().optional(),
  fingerprint: z.string().max(128).optional(),
});

@Controller('auth')
export class AuthController {
  private readonly oauth: OAuthClient;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {
    this.oauth = new OAuthClient(config);
  }

  @Public()
  @Post('register')
  register(@Body() body: unknown, @Req() req: Request) {
    const b = registerSchema.parse(body);
    return this.auth.register(b, { fingerprint: b.fingerprint, ip: clientIp(req) });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() req: Request) {
    const b = z.object({ email: z.email(), password: z.string().min(1), fingerprint: z.string().max(128).optional() }).parse(body);
    return this.auth.login(b.email, b.password, { fingerprint: b.fingerprint, ip: clientIp(req) });
  }

  @Public()
  @Post('totp/verify')
  @HttpCode(200)
  verifyTotp(@Body() body: unknown) {
    const b = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).parse(body);
    return this.auth.verifyTotp(b.challengeId, b.code);
  }

  @Post('totp/setup')
  totpSetup(@CurrentUser() user: AuthUser) {
    return this.auth.startTotpEnrolment(user.id, user.email);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.auth.refresh(z.object({ refreshToken: z.string().min(10) }).parse(body).refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown) {
    await this.auth.logout(z.object({ refreshToken: z.string().min(10) }).parse(body).refreshToken);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({ current: z.string().optional(), next: password }).parse(body);
    await this.auth.changePassword(user.id, b.current, b.next);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(204)
  async forgotPassword(@Body() body: unknown, @Req() req: Request) {
    const { email } = z.object({ email: z.email() }).parse(body);
    await this.auth.requestPasswordReset(email, clientIp(req));
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(@Body() body: unknown, @Req() req: Request) {
    const b = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/), password }).parse(body);
    await this.auth.resetPassword(b.token, b.password, clientIp(req));
  }

  @Public()
  @Get('providers')
  providers() {
    return { oauth: this.oauth.enabled() };
  }

  @Public()
  @Get('oauth/:provider/start')
  async oauthStart(@Param('provider') provider: string, @Res() res: Response) {
    const p = this.providerOf(provider);
    const state = await this.auth.createChallenge(null, { provider: p }, 'oauth_state');
    res.redirect(this.oauth.authorizeUrl(p, state));
  }

  /**
   * Provider callback. Tokens are never put in the URL: the browser receives a one-time code
   * that the web app exchanges through POST /auth/oauth/exchange.
   */
  @Public()
  @Get('oauth/:provider/callback')
  async oauthCallback(@Param('provider') provider: string, @Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    const p = this.providerOf(provider);
    const fail = (reason: string) => res.redirect(`${this.config.PUBLIC_WEB_URL}/connexion?erreur=${encodeURIComponent(reason)}`);
    const state = query.state ? await this.auth.consumeChallenge<{ provider: OAuthProvider }>(query.state, 'oauth_state') : null;
    if (!state || state.provider !== p || !query.code) return fail('oauth_state');
    try {
      const tokens = await this.auth.loginWithOAuth(p, await this.oauth.identity(p, query.code), { ip: clientIp(req) });
      const code = await this.auth.createChallenge(null, tokens, 'oauth_state', 2);
      res.redirect(`${this.config.PUBLIC_WEB_URL}/connexion/oauth?code=${code}`);
    } catch (e) {
      fail(e instanceof Error && 'code' in e ? String((e as { code: string }).code) : 'oauth_failed');
    }
  }

  @Public()
  @Post('oauth/exchange')
  @HttpCode(200)
  async oauthExchange(@Body() body: unknown): Promise<Tokens> {
    const { code } = z.object({ code: z.uuid() }).parse(body);
    const tokens = await this.auth.consumeChallenge<Tokens>(code, 'oauth_state');
    if (!tokens?.accessToken) throw unauthorized('Code de connexion expiré');
    return tokens;
  }

  private providerOf(p: string): OAuthProvider {
    if (p !== 'google' && p !== 'facebook') throw badRequest('unknown_provider', 'Fournisseur inconnu');
    if (!this.oauth.enabled().includes(p)) throw badRequest('provider_disabled', `Connexion ${p} non configurée`);
    return p;
  }
}
