const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const pct = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const int = new Intl.NumberFormat('pt-BR');

export const money = (v: string | null | undefined) => (v == null ? '—' : brl.format(Number(v)));
export const percent = (v: string | null | undefined) => (v == null ? '—' : pct.format(Number(v)));
export const quantity = (v: number) => int.format(v);

export function signed(v: string | null | undefined): 'up' | 'down' | 'flat' {
  if (v == null) return 'flat';
  const n = Number(v);
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} de ${y}`;
}

export function dateBr(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const CLASS_LABEL: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'FIIs',
  ETF: 'ETFs',
  BDR: 'BDRs',
};
export const BUCKET_LABEL: Record<string, string> = {
  SWING: 'Operações comuns',
  DAY_TRADE: 'Day trade',
  FII: 'Fundos imobiliários',
};
