-- Esquema inicial do b3-portfolio-tracker (PostgreSQL 14+)
-- Valores monetários em NUMERIC: nunca float para dinheiro.

CREATE TABLE trades (
    id          UUID PRIMARY KEY,
    ticker      VARCHAR(8)     NOT NULL CHECK (ticker ~ '^[A-Z]{4}[0-9]{1,2}$'),
    asset_class VARCHAR(5)     NOT NULL CHECK (asset_class IN ('STOCK', 'FII', 'ETF', 'BDR')),
    side        VARCHAR(4)     NOT NULL CHECK (side IN ('BUY', 'SELL')),
    quantity    INTEGER        NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(18, 8) NOT NULL CHECK (unit_price > 0),
    fees        NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    trade_date  DATE           NOT NULL,
    broker      VARCHAR(80),
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX trades_ticker_date_idx ON trades (ticker, trade_date);

CREATE TABLE income_events (
    id            UUID PRIMARY KEY,
    ticker        VARCHAR(8)     NOT NULL CHECK (ticker ~ '^[A-Z]{4}[0-9]{1,2}$'),
    type          VARCHAR(10)    NOT NULL CHECK (type IN ('DIVIDEND', 'JCP', 'FII_INCOME')),
    payer_cnpj    CHAR(14)       CHECK (payer_cnpj ~ '^[0-9]{14}$'),
    gross_amount  NUMERIC(18, 2) NOT NULL CHECK (gross_amount > 0),
    payment_date  DATE           NOT NULL,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX income_events_payment_date_idx ON income_events (payment_date);
