"""API HTTP do serviço de analytics (FastAPI)."""

from __future__ import annotations

import os
from typing import Annotated

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator

from analytics import __version__
from analytics.risk import InsufficientDataError, risk_report

MAX_POINTS = 10_000

Price = Annotated[float, Field(gt=0, allow_inf_nan=False)]


class RiskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prices: list[Price] = Field(min_length=3, max_length=MAX_POINTS)
    benchmark_prices: list[Price] | None = Field(default=None, max_length=MAX_POINTS)
    risk_free_daily: float = Field(default=0.0, ge=-0.01, le=0.01, allow_inf_nan=False)

    @model_validator(mode="after")
    def same_length(self) -> RiskRequest:
        if self.benchmark_prices is not None and len(self.benchmark_prices) != len(self.prices):
            raise ValueError("benchmark_prices deve ter o mesmo tamanho de prices")
        return self


class RiskResponse(BaseModel):
    observations: int
    annualized_return: float
    annualized_volatility: float
    sharpe: float | None
    sortino: float | None
    max_drawdown: float
    var_95: float
    beta: float | None


app = FastAPI(title="b3pt-analytics", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip() for o in os.getenv("CORS_ORIGIN", "http://localhost:5173").split(",") if o.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/v1/risk", response_model=RiskResponse)
def compute_risk(body: RiskRequest) -> RiskResponse:
    prices = np.asarray(body.prices, dtype=np.float64)
    bench = np.asarray(body.benchmark_prices, dtype=np.float64) if body.benchmark_prices else None
    try:
        report = risk_report(prices, body.risk_free_daily, bench)
    except InsufficientDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return RiskResponse(**{field: getattr(report, field) for field in RiskResponse.model_fields})
