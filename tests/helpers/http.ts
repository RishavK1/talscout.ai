/* eslint-disable @typescript-eslint/no-explicit-any */
type RouteCtx = { params?: Promise<Record<string, string>> };
type Handler = (req: Request, routeCtx?: RouteCtx) => Promise<Response>;

export interface CallOpts {
  token?: string;
  method?: string;
  body?: unknown;
  url?: string;
  contentType?: string | null;
  routeCtx?: RouteCtx;
  headers?: Record<string, string>;
}

/** Invoke a route handler with a crafted Request; return status + parsed json. */
export async function call(
  handler: Handler,
  opts: CallOpts = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) {
    headers["content-type"] = opts.contentType ?? "application/json";
  } else if (opts.contentType) {
    headers["content-type"] = opts.contentType;
  }
  if (opts.headers) Object.assign(headers, opts.headers);

  const req = new Request(opts.url ?? "http://test.local/api", {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const res = await handler(req, opts.routeCtx);
  const json = await res.json();
  return { status: res.status, json };
}
