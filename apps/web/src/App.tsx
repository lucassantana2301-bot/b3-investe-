import { useCallback, useEffect, useState } from 'react';
import { type AssetClass, ApiError, type Portfolio, type TaxMonth, api, apiKey } from './api';
import { DarfSlip } from './components/DarfSlip';
import { TradeForm } from './components/TradeForm';
import { CLASS_LABEL, money, percent, quantity, signed } from './format';

type Load =
  | { state: 'loading' }
  | { state: 'ready'; portfolio: Portfolio; tax: TaxMonth[] }
  | { state: 'error'; error: ApiError | Error };

const CLASS_ORDER: AssetClass[] = ['STOCK', 'FII', 'ETF', 'BDR'];

export function App() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [month, setMonth] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [portfolio, tax] = await Promise.all([api.portfolio(), api.tax(year)]);
      setLoad({ state: 'ready', portfolio, tax });
    } catch (error) {
      setLoad({ state: 'error', error: error as Error });
    }
  }, [year]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.state === 'error' && load.error instanceof ApiError && load.error.status === 401) {
    return (
      <ApiKeyPrompt
        onSubmit={(key) => {
          apiKey.set(key);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="page">
      <header className="masthead">
        <h1 className="masthead__title">Carteira B3</h1>
        <label className="masthead__year">
          Ano-calendário
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setMonth(null);
            }}
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </header>

      {load.state === 'loading' && <p className="notice">Carregando carteira…</p>}
      {load.state === 'error' && (
        <p className="notice notice--error" role="alert">
          {load.error.message}.{' '}
          <button type="button" onClick={() => void refresh()}>
            Tentar de novo
          </button>
        </p>
      )}

      {load.state === 'ready' && (
        <main className="layout">
          <section className="worth" aria-label="Resumo da carteira">
            <p className="worth__value">{money(load.portfolio.marketValue)}</p>
            <dl className="worth__facts">
              <Fact label="Custo das posições" value={money(load.portfolio.totalCost)} />
              <Fact
                label="Resultado em aberto"
                value={money(load.portfolio.unrealizedResult)}
                tone={signed(load.portfolio.unrealizedResult)}
              />
              <Fact
                label="Lucro realizado"
                value={money(load.portfolio.realizedResult)}
                tone={signed(load.portfolio.realizedResult)}
              />
              <Fact label="Proventos recebidos" value={money(load.portfolio.incomeReceived)} />
              <Fact label="CDI no período" value={percent(load.portfolio.cdiReturn)} />
            </dl>
            <Allocation allocation={load.portfolio.allocation} total={load.portfolio.marketValue} />
            {load.portfolio.missingQuotes.length > 0 && (
              <p className="notice">
                Sem cotação agora para {load.portfolio.missingQuotes.join(', ')}. Valores de mercado ficam parciais.
              </p>
            )}
          </section>

          <DarfSlip months={load.tax} selected={month} onSelect={setMonth} />

          <section className="positions" aria-labelledby="positions-title">
            <h2 id="positions-title">Posições</h2>
            {load.portfolio.positions.length === 0 ? (
              <p>Registre sua primeira compra ao lado para montar a carteira.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Ativo</th>
                      <th scope="col">Quantidade</th>
                      <th scope="col">Preço médio</th>
                      <th scope="col">Cotação</th>
                      <th scope="col">Valor</th>
                      <th scope="col">Resultado</th>
                      <th scope="col">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.portfolio.positions.map((p) => (
                      <tr key={p.ticker}>
                        <th scope="row">
                          {p.ticker}
                          <span className="sub">{CLASS_LABEL[p.assetClass]}</span>
                        </th>
                        <td>{quantity(p.quantity)}</td>
                        <td>{money(p.averagePrice)}</td>
                        <td>{money(p.price)}</td>
                        <td>{money(p.marketValue)}</td>
                        <td className={`tone-${signed(p.unrealizedResult)}`}>
                          {money(p.unrealizedResult)}
                          <span className="sub">{percent(p.unrealizedPercent)}</span>
                        </td>
                        <td>{percent(p.weight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <TradeForm onSaved={() => void refresh()} />
        </main>
      )}

      <footer className="colophon">
        Estimativa com base na IN RFB 1.585/2015 e na Lei 15.270/2025. Confira os valores no Sicalc antes de pagar.
      </footer>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'flat' }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className={tone ? `tone-${tone}` : undefined}>{value}</dd>
    </div>
  );
}

function Allocation({ allocation, total }: { allocation: Record<AssetClass, string>; total: string }) {
  const sum = Number(total);
  if (sum <= 0) return null;
  const parts = CLASS_ORDER.map((c) => ({
    c,
    v: Number(allocation[c]),
  })).filter((p) => p.v > 0);
  return (
    <figure className="allocation">
      <div
        className="allocation__bar"
        role="img"
        aria-label={parts.map((p) => `${CLASS_LABEL[p.c]} ${Math.round((p.v / sum) * 100)}%`).join(', ')}
      >
        {parts.map((p) => (
          <span key={p.c} className={`allocation__seg allocation__seg--${p.c}`} style={{ flexGrow: p.v }} />
        ))}
      </div>
      <figcaption className="allocation__legend">
        {parts.map((p) => (
          <span key={p.c}>
            <i className={`swatch allocation__seg--${p.c}`} aria-hidden /> {CLASS_LABEL[p.c]}{' '}
            {percent(String(p.v / sum))}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function ApiKeyPrompt({ onSubmit }: { onSubmit: (key: string) => void }) {
  return (
    <form
      className="key-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get('key');
        if (typeof value === 'string' && value.trim()) onSubmit(value.trim());
      }}
    >
      <h1>Informe a chave da API</h1>
      <p>A API está protegida. A chave fica só nesta aba do navegador.</p>
      <label>
        Chave
        <input name="key" type="password" autoComplete="off" required />
      </label>
      <button type="submit">Entrar</button>
    </form>
  );
}
