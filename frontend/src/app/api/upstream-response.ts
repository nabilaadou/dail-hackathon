import { NextResponse } from 'next/server';

const MAX_ERROR_LENGTH = 500;

export async function forwardUpstreamResponse(response: Response) {
  const text = await response.text();

  if (text.trim()) {
    try {
      return NextResponse.json(JSON.parse(text), { status: response.status });
    } catch {
      const upstreamMessage = text.trim().slice(0, MAX_ERROR_LENGTH);

      return NextResponse.json(
        {
          error: response.ok
            ? 'The parser returned an invalid response.'
            : upstreamMessage || `The parser failed with HTTP ${response.status}.`,
        },
        { status: response.ok ? 502 : response.status }
      );
    }
  }

  return NextResponse.json(
    {
      error: response.ok
        ? 'The parser returned an empty response.'
        : `The parser failed with HTTP ${response.status}.`,
    },
    { status: response.ok ? 502 : response.status }
  );
}

export function backendConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to reach the parser.';

  return NextResponse.json({ error: `Backend connection failed: ${message}` }, { status: 502 });
}
