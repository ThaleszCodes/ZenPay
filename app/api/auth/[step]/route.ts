import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';
import { createSession, sessionAge, sessionCookie } from '../../../../lib/seller-session';

const stateCookie = 'zenpay_oauth_state';

export async function GET(req: NextRequest, { params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const origin = new URL(process.env.ZENPAY_ORIGIN || req.nextUrl.origin).origin;
  const cookie = { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax' as const, path: '/' };
  const home = (error?: string) => NextResponse.redirect(new URL(error ? '/?login=' + error : '/', origin));
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || (process.env.ZENPAY_SESSION_SECRET?.length ?? 0) < 32) return home('setup');
  const redirectUri = origin + '/api/auth/callback';

  if (step === 'start') {
    const state = randomBytes(32).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set(stateCookie, state, { ...cookie, maxAge: 600 });
    return response;
  }

  if (step !== 'callback') return new NextResponse(null, { status: 404 });
  const state = req.nextUrl.searchParams.get('state');
  const code = req.nextUrl.searchParams.get('code');
  const failure = home('failed');
  failure.cookies.delete(stateCookie);
  if (!state || state !== req.cookies.get(stateCookie)?.value || !code) return failure;

  try {
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!token.ok) return failure;
    const { access_token: accessToken } = z.object({ access_token: z.string().min(1) }).parse(await token.json());
    const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(10000),
    });
    if (!profile.ok) return failure;
    const { sub, email, name } = z.object({
      sub: z.string().min(1), email: z.string().email(), email_verified: z.literal(true), name: z.string().optional(),
    }).parse(await profile.json());
    // Match a verified email to preserve the seller's existing store and orders.
    const sellers = await sql('SELECT id FROM zenpay_sellers WHERE lower(email)=lower($1) LIMIT 2', [email]);
    if (sellers.length > 1) return failure;
    const user = { userId: sellers[0]?.id ?? 'google:' + sub, email, displayName: name || email, fullName: name || null };
    const response = home();
    response.cookies.delete(stateCookie);
    response.cookies.set(sessionCookie, createSession(user), { ...cookie, maxAge: sessionAge });
    return response;
  } catch {
    return failure;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ step: string }> }) {
  if ((await params).step !== 'logout') return new NextResponse(null, { status: 404 });
  if (req.headers.get('origin') !== req.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const response = NextResponse.redirect(new URL('/', req.nextUrl.origin), 303);
  response.cookies.delete(sessionCookie);
  return response;
}
