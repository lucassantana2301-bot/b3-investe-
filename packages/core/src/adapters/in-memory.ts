import type { IncomeRepository, TradeRepository } from '../application/ports.js';
import type { IncomeEvent } from '../domain/income.js';
import type { Trade } from '../domain/trade.js';

/** Adapters em memória: usados em testes e no modo DB_DRIVER=memory. */
export class InMemoryTradeRepository implements TradeRepository {
  private readonly items = new Map<string, Trade>();

  async save(trade: Trade): Promise<void> {
    this.items.set(trade.id, trade);
  }

  async findAll(): Promise<Trade[]> {
    return [...this.items.values()];
  }

  async findById(id: string): Promise<Trade | null> {
    return this.items.get(id) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}

export class InMemoryIncomeRepository implements IncomeRepository {
  private readonly items = new Map<string, IncomeEvent>();

  async save(event: IncomeEvent): Promise<void> {
    this.items.set(event.id, event);
  }

  async findAll(): Promise<IncomeEvent[]> {
    return [...this.items.values()];
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}
