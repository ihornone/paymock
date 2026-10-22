/**
 * Centralized API client.
 *
 * Every browser-side call to the Paymock API goes through this module:
 * a single timeout, a single error taxonomy, and a single place where
 * credentials are attached. Components never call `fetch` directly.
 */

export const API_TIMEOUT_MS = 20_000;

/** Error taxonomy shared by every API call. */
export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'validation'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'rate_limit'
  | 'server'
  | 'unknown';

export interface ApiErrorPayload {
  errCode?: string;
  errText?: string;
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  public readonly kind: ApiErrorKind;
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: ApiErrorPayload;
  public override readonly cause?: unknown;

  constructor(
    kind: ApiErrorKind,
    status: number,
    message: string,
    options?: { cause?: unknown; code?: string; details?: ApiErrorPayload }
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** 4xx rejections are expected — the UI shows a message, it is not a crash. */
  get isExpectedRejection(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Performs an API request and normalizes every failure into an `ApiError`.
 *
 * @throws {ApiError} for any non-2xx response, network failure or timeout.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    signal,
    timeoutMs = API_TIMEOUT_MS,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Propagate the caller's cancellation into our controller.
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      let payload: ApiErrorPayload | undefined;
      try {
        payload = (await response.json()) as ApiErrorPayload;
      } catch {
        payload = undefined;
      }

      throw new ApiError(
        kindForStatus(response.status),
        response.status,
        payload?.errText || payload?.message || payload?.error || `Request failed with status ${response.status}`,
        { code: payload?.errCode, details: payload }
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('timeout', 0, 'The request timed out. Please try again.', { cause: error });
    }

    throw new ApiError('network', 0, 'Unable to reach the server. Check your connection.', {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
