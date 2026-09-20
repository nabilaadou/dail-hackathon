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

    const requestUrl = new URL(request.url);
    const limit = requestUrl.searchParams.get('limit');
    const damageOnly = requestUrl.searchParams.get('damage_only');
    const backendUrl = new URL(`${BACKEND_URL.replace(/\/$/, '')}/parse-csv`);

    if (limit) backendUrl.searchParams.set('limit', limit);
    if (damageOnly) backendUrl.searchParams.set('damage_only', damageOnly);

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      body: csv,
      cache: 'no-store',
      signal: AbortSignal.timeout(180000),
    });

    return forwardUpstreamResponse(response);
  } catch (error) {
    return backendConnectionError(error);
  }
}
