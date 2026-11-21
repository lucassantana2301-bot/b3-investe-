-- Esquema Microsoft Access (.accdb), dialeto ANSI-92 via ACE OLEDB.
-- Executado por scripts/windows/setup-access.ps1. Um comando por bloco, separados por ';'.
-- IDs são UUID gerados pela aplicação (TEXT(36)), por isso não há COUNTER.

CREATE TABLE trades (
    [id]          TEXT(36)       NOT NULL CONSTRAINT pk_trades PRIMARY KEY,
    [ticker]      TEXT(8)        NOT NULL,
    [asset_class] TEXT(5)        NOT NULL,
    [side]        TEXT(4)        NOT NULL,
    [quantity]    LONG           NOT NULL,
    [unit_price]  DECIMAL(18, 8) NOT NULL,
    [fees]        DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [trade_date]  DATETIME       NOT NULL,
    [broker]      TEXT(80),
    [created_at]  DATETIME       DEFAULT Now(),
    CONSTRAINT chk_trades_quantity CHECK ([quantity] > 0),
    CONSTRAINT chk_trades_side CHECK ([side] IN ('BUY', 'SELL')),
    CONSTRAINT chk_trades_class CHECK ([asset_class] IN ('STOCK', 'FII', 'ETF', 'BDR'))
);

CREATE INDEX ix_trades_ticker_date ON trades ([ticker], [trade_date]);

CREATE TABLE income_events (
    [id]           TEXT(36)       NOT NULL CONSTRAINT pk_income_events PRIMARY KEY,
    [ticker]       TEXT(8)        NOT NULL,
    [type]         TEXT(10)       NOT NULL,
    [payer_cnpj]   TEXT(14),
    [gross_amount] DECIMAL(18, 2) NOT NULL,
    [payment_date] DATETIME       NOT NULL,
    [created_at]   DATETIME       DEFAULT Now(),
    CONSTRAINT chk_income_type CHECK ([type] IN ('DIVIDEND', 'JCP', 'FII_INCOME')),
    CONSTRAINT chk_income_amount CHECK ([gross_amount] > 0)
);

CREATE INDEX ix_income_payment_date ON income_events ([payment_date]);
