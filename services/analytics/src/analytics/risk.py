"""Métricas de risco sobre séries de preços diários.

Convenções:
  * Retornos simples diários: r_t = P_t / P_{t-1} - 1.
  * Anualização com 252 pregões (calendário da B3).
  * Taxa livre de risco informada como taxa diária (ex.: CDI diário da série 12 do BCB / 100).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

TRADING_DAYS = 252

FloatArray = NDArray[np.float64]


class InsufficientDataError(ValueError):
    """Série curta demais ou inválida para a métrica pedida."""


def to_returns(prices: FloatArray) -> FloatArray:
    if prices.ndim != 1 or prices.size < 3:
        raise InsufficientDataError("são necessários pelo menos 3 preços")
    if not np.all(np.isfinite(prices)) or np.any(prices <= 0):
        raise InsufficientDataError("preços devem ser finitos e positivos")
    return prices[1:] / prices[:-1] - 1.0


def annualized_volatility(returns: FloatArray) -> float:
    return float(np.std(returns, ddof=1) * np.sqrt(TRADING_DAYS))


def annualized_return(returns: FloatArray) -> float:
    growth = float(np.prod(1.0 + returns))
    return growth ** (TRADING_DAYS / returns.size) - 1.0


def sharpe_ratio(returns: FloatArray, risk_free_daily: float) -> float | None:
    excess = returns - risk_free_daily
    sd = np.std(excess, ddof=1)
    if sd == 0:
        return None
    return float(np.mean(excess) / sd * np.sqrt(TRADING_DAYS))


def sortino_ratio(returns: FloatArray, risk_free_daily: float) -> float | None:
    excess = returns - risk_free_daily
    downside = np.minimum(excess, 0.0)
    downside_dev = np.sqrt(np.mean(downside**2))
    if downside_dev == 0:
        return None
    return float(np.mean(excess) / downside_dev * np.sqrt(TRADING_DAYS))


def max_drawdown(prices: FloatArray) -> float:
    """Maior queda do pico ao vale, como fração negativa (ex.: -0.23)."""
    running_peak = np.maximum.accumulate(prices)
    drawdowns = prices / running_peak - 1.0
    return float(drawdowns.min())


def beta(returns: FloatArray, benchmark_returns: FloatArray) -> float | None:
    if returns.size != benchmark_returns.size:
        raise InsufficientDataError("série e benchmark precisam ter o mesmo tamanho")
    var_b = np.var(benchmark_returns, ddof=1)
    if var_b == 0:
        return None
    cov = np.cov(returns, benchmark_returns, ddof=1)[0, 1]
    return float(cov / var_b)


def historical_var(returns: FloatArray, confidence: float = 0.95) -> float:
    """VaR histórico de 1 dia: perda (fração positiva) não excedida com a confiança dada."""
    if not 0.5 < confidence < 1.0:
        raise ValueError("confidence deve estar entre 0.5 e 1")
    return float(-np.quantile(returns, 1.0 - confidence))


@dataclass(frozen=True, slots=True)
class RiskReport:
    observations: int
    annualized_return: float
    annualized_volatility: float
    sharpe: float | None
    sortino: float | None
    max_drawdown: float
    var_95: float
    beta: float | None


def risk_report(
    prices: FloatArray,
    risk_free_daily: float = 0.0,
    benchmark_prices: FloatArray | None = None,
) -> RiskReport:
    returns = to_returns(prices)
    bench_beta: float | None = None
    if benchmark_prices is not None:
        bench_beta = beta(returns, to_returns(benchmark_prices))

    return RiskReport(
        observations=int(prices.size),
        annualized_return=annualized_return(returns),
        annualized_volatility=annualized_volatility(returns),
        sharpe=sharpe_ratio(returns, risk_free_daily),
        sortino=sortino_ratio(returns, risk_free_daily),
        max_drawdown=max_drawdown(prices),
        var_95=historical_var(returns, 0.95),
        beta=bench_beta,
    )
