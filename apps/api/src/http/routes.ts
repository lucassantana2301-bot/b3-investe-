import { ASSET_CLASSES, INCOME_TYPES, type PortfolioService } from '@b3pt/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  serializeIncome,
  serializeIncomeSummary,
  serializeSummary,
  serializeTaxReport,
  serializeTrade,
} from './serializers.js';

const decimalString = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((v) => /^\d{1,12}(\.\d{1,8})?$/.test(v), 'número decimal positivo com até 8 casas');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato YYYY-MM-DD');

const TradeBody = z
  .object({
    ticker: z.string().min(5).max(7),
    assetClass: z.enum(ASSET_CLASSES),
    side: z.enum(['BUY', 'SELL']),
    quantity: z.number().int().positive().max(1_000_000_000),
    unitPrice: decimalString,
    fees: decimalString.optional(),
    tradeDate: isoDate,
    broker: z.string().max(80).nullish(),
  })
  .strict();

const IncomeBody = z
  .object({
    ticker: z.string().min(5).max(7),
    type: z.enum(INCOME_TYPES),
    payerCnpj: z.string().max(18).nullish(),
    grossAmount: decimalString,
    paymentDate: isoDate,
  })
  .strict();

const IdParams = z.object({ id: z.string().uuid() });
const YearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

export function registerRoutes(service: PortfolioService): FastifyPluginAsync {
  return async (app) => {
    app.get('/trades', async () => (await service.listTrades()).map(serializeTrade));

    app.post('/trades', async (request, reply) => {
      const { fees, broker, ...body } = TradeBody.parse(request.body);
      const trade = await service.registerTrade({
        ...body,
        broker: broker ?? null,
        ...(fees !== undefined ? { fees } : {}),
      });
      return reply.code(201).send(serializeTrade(trade));
    });

    app.delete('/trades/:id', async (request, reply) => {
      const { id } = IdParams.parse(request.params);
      await service.deleteTrade(id);
      return reply.code(204).send();
    });

    app.get('/incomes', async () => (await service.listIncomes()).map(serializeIncome));

    app.post('/incomes', async (request, reply) => {
      const body = IncomeBody.parse(request.body);
      const event = await service.registerIncome({ ...body, payerCnpj: body.payerCnpj ?? null });
      return reply.code(201).send(serializeIncome(event));
    });

    app.delete('/incomes/:id', async (request, reply) => {
      const { id } = IdParams.parse(request.params);
      await service.deleteIncome(id);
      return reply.code(204).send();
    });

    app.get('/incomes/summary', async (request) => {
      const { year } = YearQuery.parse(request.query);
      return (await service.incomeSummary(year)).map(serializeIncomeSummary);
    });

    app.get('/portfolio', async () => serializeSummary(await service.summary()));

    app.get('/tax', async (request) => {
      const { year } = YearQuery.parse(request.query);
      return (await service.taxReport(year)).map(serializeTaxReport);
    });
  };
}
