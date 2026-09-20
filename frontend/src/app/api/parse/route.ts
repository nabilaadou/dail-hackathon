import { NextResponse } from 'next/server';

import { backendConnectionError, forwardUpstreamResponse } from '../upstream-response';

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:8000';

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'The request body must be valid JSON.' }, { status: 400 });
  }

  try {
    const response = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    });

    return forwardUpstreamResponse(response);
  } catch (error) {
    return backendConnectionError(error);
  }
}
