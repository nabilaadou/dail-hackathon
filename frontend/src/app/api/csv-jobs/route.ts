import { NextResponse } from 'next/server';

import { backendConnectionError, forwardUpstreamResponse } from '../upstream-response';

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:8000';

export async function POST(request: Request) {
  try {
    const csv = await request.text();
    if (!csv.trim()) {
      return NextResponse.json({ error: 'Choose a non-empty CSV file.' }, { status: 400 });
    }
    const url = new URL(`${BACKEND_URL.replace(/\/$/, '')}/csv-jobs`);
    const limit = new URL(request.url).searchParams.get('limit');
    if (limit !== null) url.searchParams.set('limit', limit);
    return await forwardUpstreamResponse(
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: csv,
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      })
    );
  } catch (error) {
    return backendConnectionError(error);
  }
}
