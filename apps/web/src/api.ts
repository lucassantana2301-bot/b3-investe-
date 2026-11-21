export type AssetClass = 'STOCK' | 'FII' | 'ETF' | 'BDR';

export interface Position {
  ticker: string;
  assetClass: AssetClass;
  quantity: number;
  averagePrice: string;
  totalCost: string;
  price: string | null;
  marketValue: string | null;
  unrealizedResult: string | null;
  unrealizedPercent: string | null;
  weight: string | null;
}

export interface Portfolio {
  positions: Position[];
  totalCost: string;
  marketValue: string;
  unrealizedResult: string;
  realizedResult: string;
  incomeReceived: string;
  allocation: Record<AssetClass, string>;
  missingQuotes: string[];
  firstTradeDate: string | null;
  cdiReturn: string | null;
}

export interface TaxBucket {
  bucket: 'SWING' | 'DAY_TRADE' | 'FII';
  rate: string;
  monthResult: string;
  lossCarryOut: string;
  taxableBase: string;
  tax: string;
}

export interface TaxMonth {
  month: string;
  stockSwingSales: string;
  stockExemptionApplied: boolean;
  exemptStockProfit: string;
  buckets: TaxBucket[];
  grossTax: string;
  irrfUsed: string;
  netTax: string;
  darfCarryIn: string;
  darfPayable: string;
  darfCarryOut: string;
  darfDueDate: string | null;
  darfCode: string;
}

export interface NewTrade {
  ticker: string;
  assetClass: AssetClass;
  side: 'BUY' | 'SELL';
  quantity: number;
  unitPrice: string;
  fees?: string;
  tradeDate: string;
  broker?: string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const KEY_STORAGE = 'b3pt.apiKey';

/** A chave fica só na sessão do navegador: nunca é embutida no bundle. */
export const apiKey = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(KEY_STORAGE);
    } catch {
      return null;
    }
  },
  set: (value: string) => {
    try {
      sessionStorage.setItem(KEY_STORAGE, value);
    } catch {
      /* modo privado sem storage: segue sem persistir */
    }
  },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = apiKey.get();
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'HTTP_ERROR', body.message ?? `Erro ${res.status}`);
  return body as T;
}

export const api = {
  portfolio: () => request<Portfolio>('/portfolio'),
  tax: (year: number) => request<TaxMonth[]>(`/tax?year=${year}`),
  createTrade: (trade: NewTrade) =>
    request<unknown>('/trades', {
      method: 'POST',
      body: JSON.stringify(trade),
    }),
};
