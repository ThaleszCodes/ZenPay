import { createHmac, timingSafeEqual } from 'node:crypto';

export const sessionCookie = 'zenpay_session';
export const sessionAge = 60 * 60 * 24 * 7;

function signature(value: string) {
  const secret = process.env.ZENPAY_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSession(user: { userId: string; email: string; displayName: string; fullName: string | null }) {
  const value = Buffer.from(JSON.stringify({ user, expires: Date.now() + sessionAge * 1000 })).toString('base64url');
  const mac = signature(value);
  if (!mac) throw new Error('Configure ZENPAY_SESSION_SECRET.');
  return value + '.' + mac;
}

export function readSession(token?: string) {
  const [value, mac, extra] = token?.split('.') ?? [];
  if (!value || !mac || extra || token!.length > 4096) return null;
  const expected = signature(value);
  if (!expected || Buffer.byteLength(mac) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(value, 'base64url').toString());
    return session.expires > Date.now() ? session.user : null;
  } catch {
    return null;
  }
}
