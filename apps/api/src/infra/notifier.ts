import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Config } from '../config.js';

export type Channel = 'email' | 'sms' | 'whatsapp' | 'push';

export interface OutboundMessage {
  channel: Channel;
  to: string;
  subject?: string;
  text: string;
  url?: string;
}

/** Port for outbound notifications (email, SMS via Twilio, WhatsApp Business, in-app push). */
export interface Notifier {
  send(message: OutboundMessage): Promise<void>;
}

/** Development / sandbox: logs messages instead of sending them. */
export class ConsoleNotifier implements Notifier {
  private readonly logger = new Logger('Notifier');
  async send(m: OutboundMessage) {
    this.logger.log(`[${m.channel} → ${m.to}] ${m.subject ? `${m.subject} — ` : ''}${m.text}${m.url ? ` ${m.url}` : ''}`);
  }
}

/** Test double that records what would have been sent. */
export class MemoryNotifier implements Notifier {
  readonly sent: OutboundMessage[] = [];
  async send(m: OutboundMessage) {
    this.sent.push(m);
  }
}

export class LiveNotifier implements Notifier {
  private readonly mailer;
  private readonly fallback = new ConsoleNotifier();

  constructor(private readonly cfg: Config) {
    this.mailer = cfg.SMTP_URL ? nodemailer.createTransport(cfg.SMTP_URL) : null;
  }

  async send(m: OutboundMessage) {
    const body = m.url ? `${m.text}\n${m.url}` : m.text;
    switch (m.channel) {
      case 'email':
        if (!this.mailer) return this.fallback.send(m);
        await this.mailer.sendMail({ from: this.cfg.MAIL_FROM, to: m.to, subject: m.subject ?? 'C2Pass', text: body });
        return;
      case 'sms':
        if (!this.cfg.TWILIO_ACCOUNT_SID || !this.cfg.TWILIO_AUTH_TOKEN || !this.cfg.TWILIO_FROM) return this.fallback.send(m);
        await this.twilio({ From: this.cfg.TWILIO_FROM, To: m.to, Body: body.slice(0, 1500) });
        return;
      case 'whatsapp':
        if (!this.cfg.WHATSAPP_TOKEN || !this.cfg.WHATSAPP_PHONE_NUMBER_ID) return this.fallback.send(m);
        await this.whatsapp(m.to, body);
        return;
      case 'push':
        // In-app notifications are stored by the alerts module; native push arrives with the mobile app.
        return;
    }
  }

  private async twilio(form: Record<string, string>) {
    const sid = this.cfg.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${this.cfg.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form),
    });
    if (!res.ok) throw new Error(`Twilio SMS failed (${res.status})`);
  }

  private async whatsapp(to: string, text: string) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${this.cfg.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/[^0-9]/g, ''), type: 'text', text: { body: text.slice(0, 4000) } }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed (${res.status})`);
  }
}

export const NOTIFIER = Symbol('NOTIFIER');
