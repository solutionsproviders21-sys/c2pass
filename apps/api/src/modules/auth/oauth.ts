import type { Config } from '../../config.js';

export type OAuthProvider = 'google' | 'facebook';

export interface OAuthIdentity {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** Google and Facebook OAuth 2.0 authorization-code flow (server side, no client secret in the browser). */
export class OAuthClient {
  constructor(private readonly cfg: Config) {}

  enabled(): OAuthProvider[] {
    const list: OAuthProvider[] = [];
    if (this.cfg.GOOGLE_CLIENT_ID && this.cfg.GOOGLE_CLIENT_SECRET) list.push('google');
    if (this.cfg.FACEBOOK_APP_ID && this.cfg.FACEBOOK_APP_SECRET) list.push('facebook');
    return list;
  }

  redirectUri(provider: OAuthProvider) {
    return `${this.cfg.API_PUBLIC_URL}/api/auth/oauth/${provider}/callback`;
  }

  authorizeUrl(provider: OAuthProvider, state: string): string {
    if (provider === 'google') {
      const q = new URLSearchParams({
        client_id: this.cfg.GOOGLE_CLIENT_ID!, redirect_uri: this.redirectUri('google'), response_type: 'code',
        scope: 'openid email profile', state, prompt: 'select_account',
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }
    const q = new URLSearchParams({ client_id: this.cfg.FACEBOOK_APP_ID!, redirect_uri: this.redirectUri('facebook'), state, scope: 'email,public_profile', response_type: 'code' });
    return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
  }

  async identity(provider: OAuthProvider, code: string): Promise<OAuthIdentity> {
    return provider === 'google' ? this.google(code) : this.facebook(code);
  }

  private async google(code: string): Promise<OAuthIdentity> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: this.cfg.GOOGLE_CLIENT_ID!, client_secret: this.cfg.GOOGLE_CLIENT_SECRET!,
        redirect_uri: this.redirectUri('google'), grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status})`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!me.ok) throw new Error(`Google userinfo failed (${me.status})`);
    const p = (await me.json()) as { sub: string; email?: string; email_verified?: boolean; given_name?: string; family_name?: string };
    if (!p.email || !p.email_verified) throw new Error('Google account has no verified email');
    return { id: p.sub, email: p.email, firstName: p.given_name ?? '', lastName: p.family_name ?? '' };
  }

  private async facebook(code: string): Promise<OAuthIdentity> {
    const q = new URLSearchParams({ client_id: this.cfg.FACEBOOK_APP_ID!, client_secret: this.cfg.FACEBOOK_APP_SECRET!, redirect_uri: this.redirectUri('facebook'), code });
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${q}`);
    if (!tokenRes.ok) throw new Error(`Facebook token exchange failed (${tokenRes.status})`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const me = await fetch(`https://graph.facebook.com/me?fields=id,email,first_name,last_name&access_token=${encodeURIComponent(access_token)}`);
    if (!me.ok) throw new Error(`Facebook profile failed (${me.status})`);
    const p = (await me.json()) as { id: string; email?: string; first_name?: string; last_name?: string };
    if (!p.email) throw new Error('Facebook account has no email');
    return { id: p.id, email: p.email, firstName: p.first_name ?? '', lastName: p.last_name ?? '' };
  }
}
