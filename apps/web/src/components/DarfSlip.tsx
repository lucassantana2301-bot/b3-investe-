import type { TaxMonth } from '../api';
import { BUCKET_LABEL, dateBr, money, monthLabel, percent } from '../format';

interface Props {
  months: TaxMonth[];
  selected: string | null;
  onSelect: (month: string) => void;
}

/** A guia de recolhimento é o centro da tela: o que pagar, quando e com qual código. */
export function DarfSlip({ months, selected, onSelect }: Props) {
  // Sem escolha do usuário, mostra a guia mais recente a pagar (ou o último mês apurado).
  const current =
    months.find((m) => m.month === selected) ??
    [...months].reverse().find((m) => Number(m.darfPayable) > 0) ??
    months.at(-1);

  if (!current) {
    return (
      <section className="darf darf--empty" aria-labelledby="darf-title">
        <h2 id="darf-title">Nenhuma venda neste ano</h2>
        <p>Quando você registrar uma venda, a apuração do mês e o DARF aparecem aqui.</p>
      </section>
    );
  }

  const payable = Number(current.darfPayable) > 0;
  const [year, month] = current.month.split('-');

  return (
    <section className="darf" aria-labelledby="darf-title">
      <header className="darf__head">
        <div>
          <p className="darf__issuer">Documento de Arrecadação de Receitas Federais</p>
          <h2 id="darf-title" className="darf__title">
            DARF de {monthLabel(current.month)}
          </h2>
        </div>
        <label className="darf__picker">
          <span className="visually-hidden">Mês de apuração</span>
          <select value={current.month} onChange={(e) => onSelect(e.target.value)}>
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {monthLabel(m.month)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <dl className="darf__grid">
        <div className="darf__field">
          <dt>Período de apuração</dt>
          <dd>{`${month}/${year}`}</dd>
        </div>
        <div className="darf__field">
          <dt>Código da receita</dt>
          <dd>{current.darfCode}</dd>
        </div>
        <div className="darf__field darf__field--due">
          <dt>Vencimento</dt>
          <dd>{payable ? dateBr(current.darfDueDate) : 'Sem guia neste mês'}</dd>
        </div>
        <div className="darf__field darf__field--total">
          <dt>Valor total</dt>
          <dd className="darf__amount">{money(current.darfPayable)}</dd>
        </div>
      </dl>

      {!payable && Number(current.darfCarryOut) > 0 && (
        <p className="darf__note">
          {money(current.darfCarryOut)} ficam para o próximo mês: a Receita não emite DARF abaixo de R$ 10,00.
        </p>
      )}
      {current.stockExemptionApplied && (
        <p className="darf__note">
          Vendas de ações somaram {money(current.stockSwingSales)} no mês: lucro de {money(current.exemptStockProfit)}{' '}
          isento pela regra dos R$ 20 mil. Declare na ficha de rendimentos isentos.
        </p>
      )}

      <div className="table-scroll">
        <table className="darf__table">
          <caption className="visually-hidden">Apuração por categoria</caption>
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              <th scope="col">Resultado</th>
              <th scope="col">Prejuízo a compensar</th>
              <th scope="col">Imposto</th>
            </tr>
          </thead>
          <tbody>
            {current.buckets.map((b) => (
              <tr key={b.bucket}>
                <th scope="row">
                  {BUCKET_LABEL[b.bucket]}
                  <span className="sub">alíquota {percent(b.rate)}</span>
                </th>
                <td className={Number(b.monthResult) < 0 ? 'neg' : undefined}>{money(b.monthResult)}</td>
                <td>{money(b.lossCarryOut)}</td>
                <td>{money(b.tax)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                IRRF já retido pela corretora
              </th>
              <td>− {money(current.irrfUsed)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
