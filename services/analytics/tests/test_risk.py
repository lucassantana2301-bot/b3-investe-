import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from analytics.api import app
from analytics.risk import (
    InsufficientDataError,
    annualized_volatility,
    beta,
    historical_var,
    max_drawdown,
    risk_report,
    to_returns,
)


def test_returns_and_drawdown():
    prices = np.array([100.0, 110.0, 99.0, 120.0, 90.0])
    np.testing.assert_allclose(to_returns(prices), [0.10, -0.10, 0.212121, -0.25], rtol=1e-5)
    # Pico 120 -> vale 90 = -25%
    assert max_drawdown(prices) == pytest.approx(-0.25)


def test_volatility_of_constant_series_is_zero():
    prices = np.full(10, 50.0)
    assert annualized_volatility(to_returns(prices)) == 0.0
    report = risk_report(prices)
    assert report.sharpe is None and report.sortino is None


def test_beta_is_two_for_leveraged_series():
    rng = np.random.default_rng(42)
    bench = rng.normal(0.0005, 0.01, 500)
    asset = 2 * bench
    assert beta(asset, bench) == pytest.approx(2.0)


def test_var_95_matches_quantile():
    returns = np.linspace(-0.05, 0.05, 101)
    assert historical_var(returns, 0.95) == pytest.approx(0.045)


def test_rejects_invalid_prices():
    with pytest.raises(InsufficientDataError):
        to_returns(np.array([10.0, 0.0, 11.0]))
    with pytest.raises(InsufficientDataError):
        to_returns(np.array([10.0, 11.0]))


def test_risk_report_end_to_end():
    rng = np.random.default_rng(7)
    prices = 100 * np.cumprod(1 + rng.normal(0.0006, 0.015, 252))
    report = risk_report(prices, risk_free_daily=0.0004)
    assert report.observations == 252
    assert 0.15 < report.annualized_volatility < 0.30
    assert report.max_drawdown < 0
    assert math.isfinite(report.sharpe or 0.0)


client = TestClient(app)


def test_api_returns_metrics():
    res = client.post("/v1/risk", json={"prices": [10, 10.5, 10.2, 10.8, 11.0], "risk_free_daily": 0.0004})
    assert res.status_code == 200
    body = res.json()
    assert body["observations"] == 5
    assert body["max_drawdown"] == pytest.approx(10.2 / 10.5 - 1)


def test_api_validates_payload():
    assert client.post("/v1/risk", json={"prices": [10, -1, 11]}).status_code == 422
    assert (
        client.post("/v1/risk", json={"prices": [10, 11, 12], "benchmark_prices": [1, 2]}).status_code == 422
    )
    assert client.post("/v1/risk", json={"prices": [10, 11, 12], "extra": 1}).status_code == 422
    assert client.get("/health").json()["status"] == "ok"
