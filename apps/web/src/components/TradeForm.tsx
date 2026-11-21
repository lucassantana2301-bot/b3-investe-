import { type FormEvent, useState } from 'react';
import { type AssetClass, ApiError, type NewTrade, api } from '../api';

/** "1.234,56" -> "1234.56"; "38.12" (ponto decimal) é mantido. */
export function normalizeDecimal(raw: string): string {
  const value = raw.trim();
  return value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

interface Props {
  onSaved: () => void;
}

export function TradeForm({ onSaved }: Props) {
  const [status, setStatus] = useState<{
    kind: 'idle' | 'saving' | 'saved' | 'error';
    message?: string;
  }>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const trade: NewTrade = {
      ticker: String(data.get('ticker')).trim().toUpperCase(),
      assetClass: String(data.get('assetClass')) as AssetClass,
      side: data.get('side') === 'SELL' ? 'SELL' : 'BUY',
      quantity: Number(data.get('quantity')),
      // Aceita vírgula decimal, como o usuário brasileiro digita.
      unitPrice: normalizeDecimal(String(data.get('unitPrice'))),
      fees: normalizeDecimal(String(data.get('fees') || '0')),
      tradeDate: String(data.get('tradeDate')),
      broker: String(data.get('broker') || '').trim() || null,
    };

    setStatus({ kind: 'saving' });
    try {
      await api.createTrade(trade);
      form.reset();
      setStatus({
        kind: 'saved',
        message: `${trade.side === 'BUY' ? 'Compra' : 'Venda'} de ${trade.ticker} registrada.`,
      });
      onSaved();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Não foi possível falar com a API. Verifique se ela está rodando.';
      setStatus({ kind: 'error', message });
    }
  }

  return (
    <form className="trade-form" onSubmit={submit} aria-labelledby="trade-form-title">
      <h2 id="trade-form-title">Registrar operação</h2>
      <fieldset className="trade-form__side">
        <legend className="visually-hidden">Tipo</legend>
        <label>
          <input type="radio" name="side" value="BUY" defaultChecked /> Compra
        </label>
        <label>
          <input type="radio" name="side" value="SELL" /> Venda
        </label>
      </fieldset>
      <div className="trade-form__row">
        <label>
          Ticker
          <input name="ticker" required pattern="[A-Za-z]{4}[0-9]{1,2}[Ff]?" placeholder="PETR4" autoComplete="off" />
        </label>
        <label>
          Classe
          <select name="assetClass" defaultValue="STOCK">
            <option value="STOCK">Ação</option>
            <option value="FII">FII</option>
            <option value="ETF">ETF</option>
            <option value="BDR">BDR</option>
          </select>
        </label>
      </div>
      <div className="trade-form__row">
        <label>
          Quantidade
          <input name="quantity" type="number" min={1} step={1} required inputMode="numeric" />
        </label>
        <label>
          Preço unitário
          <input
            name="unitPrice"
            required
            inputMode="decimal"
            placeholder="38,12"
            pattern="[0-9.]+(,[0-9]{1,8})?|[0-9]+\.[0-9]{1,8}"
          />
        </label>
      </div>
      <div className="trade-form__row">
        <label>
          Custos da nota
          <input name="fees" inputMode="decimal" placeholder="0,00" pattern="[0-9.]*(,[0-9]{1,2})?" />
        </label>
        <label>
          Data do pregão
          <input name="tradeDate" type="date" required defaultValue={today()} max={today()} />
        </label>
      </div>
      <label>
        Corretora (opcional)
        <input name="broker" maxLength={80} />
      </label>
      <button type="submit" disabled={status.kind === 'saving'}>
        {status.kind === 'saving' ? 'Registrando…' : 'Registrar operação'}
      </button>
      <p className={`trade-form__status trade-form__status--${status.kind}`} role="status" aria-live="polite">
        {status.message}
      </p>
    </form>
  );
}
