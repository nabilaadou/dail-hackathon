import { backendConnectionError, forwardUpstreamResponse } from '../../upstream-response';

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:8000';

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const result = new URL(request.url).searchParams.get('result') === 'true';
    const url = `${BACKEND_URL.replace(/\/$/, '')}/csv-jobs/${encodeURIComponent(jobId)}${result ? '/result' : ''}`;
    return await forwardUpstreamResponse(
      await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
    );
  } catch (error) {
    return backendConnectionError(error);
  }
}
