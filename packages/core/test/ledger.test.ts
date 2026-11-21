import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { buildLedger } from '../src/domain/ledger.js';
import { createTrade } from '../src/domain/trade.js';
import { trade } from './helpers.js';

describe('buildLedger', () => {
  it('calcula preço médio ponderado incluindo taxas', () => {
    const { positions, realizations } = buildLedger([
      trade('BUY', 'PETR4', 100, '30', '2026-01-05', { fees: '5' }),
      trade('BUY', 'PETR4', 100, '32', '2026-01-06', { fees: '5' }),
      trade('SELL', 'PETR4', 50, '35', '2026-01-10', { fees: '2' }),
    ]);

    expect(positions).toHaveLength(1);
    expect(positions[0]!.quantity).toBe(150);
    expect(positions[0]!.averagePrice.toFixed(2)).toBe('31.05');
    expect(positions[0]!.totalCost.toFixed(2)).toBe('4657.50');

    expect(realizations).toHaveLength(1);
    expect(realizations[0]!.modality).toBe('SWING');
    expect(realizations[0]!.result.toFixed(2)).toBe('195.50');
    expect(realizations[0]!.grossSales.toFixed(2)).toBe('1750.00');
  });

  it('separa day trade do excedente de compra', () => {
    const { positions, realizations } = buildLedger([
      trade('BUY', 'VALE3', 100, '10', '2026-02-02'),
      trade('BUY', 'VALE3', 200, '11', '2026-02-03'),
      trade('SELL', 'VALE3', 50, '12', '2026-02-03'),
    ]);

    expect(realizations).toHaveLength(1);
    expect(realizations[0]!.modality).toBe('DAY_TRADE');
    expect(realizations[0]!.quantity).toBe(50);
    expect(realizations[0]!.result.toFixed(2)).toBe('50.00');
    expect(positions[0]!.quantity).toBe(250);
    expect(positions[0]!.totalCost.toFixed(2)).toBe('2650.00');
  });

  it('excedente de venda no dia vira swing pelo preço médio histórico', () => {
    const { positions, realizations } = buildLedger([
      trade('BUY', 'VALE3', 100, '10', '2026-02-02'),
      trade('BUY', 'VALE3', 50, '11', '2026-02-03'),
      trade('SELL', 'VALE3', 120, '12', '2026-02-03'),
    ]);

    const dt = realizations.find((r) => r.modality === 'DAY_TRADE')!;
    const swing = realizations.find((r) => r.modality === 'SWING')!;
    expect(dt.quantity).toBe(50);
    expect(dt.result.toFixed(2)).toBe('50.00');
    expect(swing.quantity).toBe(70);
    expect(swing.result.toFixed(2)).toBe('140.00');
    expect(positions[0]!.quantity).toBe(30);
  });

  it('remove a posição quando zera e não deixa resíduo de arredondamento', () => {
    const { positions } = buildLedger([
      trade('BUY', 'ITUB4', 3, '10', '2026-03-02', { fees: '0.01' }),
      trade('SELL', 'ITUB4', 3, '11', '2026-03-05'),
    ]);
    expect(positions).toHaveLength(0);
  });

  it('rejeita venda a descoberto', () => {
    expect(() =>
      buildLedger([trade('BUY', 'BBAS3', 10, '20', '2026-01-02'), trade('SELL', 'BBAS3', 11, '21', '2026-01-03')]),
    ).toThrowError(DomainError);
  });

  it('rejeita o mesmo ticker com classes diferentes', () => {
    expect(() =>
      buildLedger([
        trade('BUY', 'TAEE11', 10, '35', '2026-01-02'),
        trade('BUY', 'TAEE11', 10, '35', '2026-01-03', { assetClass: 'FII' }),
      ]),
    ).toThrowError(/classes diferentes/);
  });

  it('normaliza o sufixo do fracionário', () => {
    const t = createTrade({
      id: 'x',
      ticker: 'petr4f',
      assetClass: 'STOCK',
      side: 'BUY',
      quantity: 7,
      unitPrice: '30.5',
      tradeDate: '2026-01-02',
    });
    expect(t.ticker).toBe('PETR4');
  });

  it.each([
    ['ticker', { ticker: 'PETR' }],
    ['quantidade fracionária', { quantity: 1.5 }],
    ['preço zero', { unitPrice: '0' }],
    ['data inexistente', { tradeDate: '2026-02-30' }],
    ['taxa negativa', { fees: '-1' }],
  ])('valida entrada: %s', (_label, override) => {
    expect(() =>
      createTrade({
        id: 'x',
        ticker: 'PETR4',
        assetClass: 'STOCK',
        side: 'BUY',
        quantity: 1,
        unitPrice: '10',
        tradeDate: '2026-01-02',
        ...override,
      }),
    ).toThrowError(DomainError);
  });
});
