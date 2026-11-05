export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_ZENPAY_RELEASE || null },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}
