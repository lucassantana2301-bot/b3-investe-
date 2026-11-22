# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [1.0.0] - 2026-11-22

Primeira versão estável.

### Adicionado

- **Preço médio ponderado** com custos da nota em aritmética decimal exata (`decimal.js`).
- **Separação automática de day trade e swing trade** por ativo e pregão (IN RFB 1.585/2015).
- **Apuração mensal de IR** por categoria (comum, day trade, FII) com isenção de R$ 20 mil só para ações,
  compensação de prejuízo entre meses e anos, crédito de IRRF, DARF mínimo acumulado e vencimento calculado.
- **Proventos**: dividendos, JCP e rendimentos de FII, incluindo a retenção da Lei 15.270/2025.
- **Cotações** via brapi.dev e **benchmark CDI** (SGS 12 do Banco Central) com cache e degradação graciosa.
- **Métricas de risco** em Python (volatilidade, Sharpe, Sortino, drawdown, beta e VaR 95%).
- **Persistência intercambiável**: PostgreSQL com migrations versionadas e Microsoft Access via ODBC.
- **API REST** (Fastify + Zod) com API key, rate limit e Helmet; **painel React** com o DARF do mês.
- **Imagens Docker** de API, web e analytics publicadas no GHCR com SBOM e atestado de proveniência.
- **Qualidade**: CI com lint, tipos, testes de domínio, testes de integração com PostgreSQL real,
  ruff e pytest no serviço Python, e build das imagens.

[Não lançado]: https://github.com/lucassantana2301-bot/b3-investe-/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lucassantana2301-bot/b3-investe-/releases/tag/v1.0.0
