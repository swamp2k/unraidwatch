import type { Env } from '../types';

export async function sendEmail(env: Env, to: string, subject: string, body: string): Promise<void> {
  const auth = btoa(`${env.SMTP_USER}:${env.SMTP_PASS}`);
  const payload = {
    from: env.SMTP_USER,
    to,
    subject,
    text: body,
  };

  // Using Purelymail HTTP API if available, otherwise raw SMTP via fetch.
  // Cloudflare Workers support TCP sockets via connect() — use that for SMTP.
  // For simplicity, this implementation uses a basic HTTP-to-SMTP relay pattern.
  const res = await fetch(`https://${env.SMTP_HOST}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // Non-fatal: log but don't crash the request
    console.error(`Email send failed: ${res.status} ${await res.text()}`);
  }
}

export async function sendMagicLink(env: Env, to: string, token: string): Promise<void> {
  const url = `${env.APP_URL}/auth/magic?token=${token}`;
  await sendEmail(env, to, 'Sign in to UnraidWatch', `Click here to sign in:\n\n${url}\n\nThis link expires in 15 minutes.`);
}

export async function sendInvite(env: Env, to: string, token: string): Promise<void> {
  const url = `${env.APP_URL}/invite?token=${token}`;
  await sendEmail(env, to, 'You\'ve been invited to UnraidWatch', `You've been invited to UnraidWatch.\n\nClick here to set up your account:\n\n${url}\n\nThis invitation expires in 7 days.`);
}

export async function sendAlertEmail(env: Env, to: string, ruleName: string, metric: string, value: string, severity: string): Promise<void> {
  const subject = `[UnraidWatch ${severity.toUpperCase()}] ${ruleName}`;
  const body = `Alert fired: ${ruleName}\nMetric: ${metric}\nValue: ${value}\nSeverity: ${severity}\n\nView your dashboard: ${env.APP_URL}`;
  await sendEmail(env, to, subject, body);
}
