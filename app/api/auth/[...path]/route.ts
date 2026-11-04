import type { NextRequest } from 'next/server';
import { getNeonAuth } from '../../../../lib/neon-auth';

type Context = { params: Promise<{ path: string[] }> };
const routes = new Set(['sign-in/email', 'sign-up/email', 'sign-out', 'email-otp/send-verification-otp', 'email-otp/verify-email']);

export async function POST(request: NextRequest, context: Context) {
  if (!routes.has((await context.params).path.join('/'))) return new Response(null, { status: 404 });
  const auth = getNeonAuth();
  if (!auth) return Response.json({ message: 'Configure o Neon Auth na hospedagem.' }, { status: 503 });
  return auth.handler().POST(request, context);
}
