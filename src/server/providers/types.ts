import "server-only";

export interface LatLng {
  lat: number;
  lng: number;
}

export type TravelMode = "motorbike" | "bicycle" | "car" | "walk";

export interface ProviderCallOptions {
  /** Mặc định timeout 4 000 ms. */
  signal?: AbortSignal;
  requestId?: string;
}

export type ProviderErrorKind =
  "timeout" | "rate_limited" | "unauthorized" | "bad_request" | "unavailable" | "invalid_response";

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const DEFAULT_TIMEOUT_MS = 4_000;

/** fetch có timeout + ánh xạ HTTP status → ProviderError. */
export async function fetchJson<T>(
  provider: string,
  url: string,
  opts: ProviderCallOptions & { fetchImpl?: typeof fetch } = {},
): Promise<T> {
  const signal = opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ProviderError(provider, timeout ? "timeout" : "unavailable", String(err), true);
  }
  if (res.status === 401 || res.status === 403)
    throw new ProviderError(provider, "unauthorized", `HTTP ${res.status}`, false);
  if (res.status === 429) throw new ProviderError(provider, "rate_limited", "HTTP 429", true);
  if (res.status >= 500) throw new ProviderError(provider, "unavailable", `HTTP ${res.status}`, true);
  if (!res.ok) throw new ProviderError(provider, "bad_request", `HTTP ${res.status}`, false);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(provider, "invalid_response", "JSON không hợp lệ", false);
  }
}
