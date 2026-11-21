import type { z } from 'zod';

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** GET com timeout, validação de schema e mensagens que não vazam token. */
export async function fetchJson<S extends z.ZodTypeAny>(
  url: URL,
  schema: S,
  opts: { timeoutMs: number; headers?: Record<string, string>; fetchImpl?: typeof fetch },
): Promise<z.infer<S>> {
  const doFetch = opts.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, {
      headers: { accept: 'application/json', ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (error) {
    throw new UpstreamError(`Falha de rede em ${url.host}: ${(error as Error).message}`, null);
  }
  if (!response.ok) {
    throw new UpstreamError(`${url.host} respondeu ${response.status}`, response.status);
  }
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new UpstreamError(`Resposta inesperada de ${url.host}`, response.status);
  }
  return parsed.data;
}

/** Executa tarefas com concorrência limitada (evita estourar rate limit de API externa). */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}
