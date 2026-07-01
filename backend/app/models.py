"""Pydantic schemas shared across the TaurEye backend."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

Exchange = Literal["NSE", "BSE"]
Operator = Literal["gt", "gte", "lt", "lte", "eq", "between"]
Logic = Literal["AND", "OR"]


class Security(BaseModel):
    symbol: str
    name: str
    exchange: Exchange
    sector: str
    isin: str
    shares_outstanding: Optional[float] = None  # issued share count; None until enriched
    segment: Optional[str] = None  # EQ | ETF | SME


class Candle(BaseModel):
    date: str          # ISO date
    open: float
    high: float
    low: float
    close: float
    volume: int


class Metrics(BaseModel):
    """Latest computed snapshot for one security."""
    symbol: str
    name: str
    exchange: Exchange
    sector: str
    close: float
    change_pct: float
    change_abs: float
    volume: int
    rel_volume: float
    rsi_14: float
    macd_hist: float
    sma_20: float
    sma_50: float
    sma_200: float
    pct_above_sma20: float
    pct_above_sma50: float
    pct_above_sma200: float
    dist_52w_high_pct: float
    dist_52w_low_pct: float
    # Nearest support/resistance distance per timeframe (D/W/M). Support >= 0
    # (price sits above support); resistance <= 0 (price sits below resistance).
    dist_sup_d_pct: float = 0.0
    dist_res_d_pct: float = 0.0
    dist_sup_w_pct: float = 0.0
    dist_res_w_pct: float = 0.0
    dist_sup_m_pct: float = 0.0
    dist_res_m_pct: float = 0.0
    atr_pct: float
    market_cap_cr: Optional[float] = None  # None when share count is unavailable (e.g. BSE-only)
    segment: Optional[str] = None  # EQ | ETF | SME
    # ---- Condition Catalog signal flags (1 = condition true today, else 0) ----
    golden_cross: int = 0
    death_cross: int = 0
    cross_20_50_up: int = 0
    cross_20_50_down: int = 0
    new_high_52w: int = 0
    new_low_52w: int = 0
    macd_bull_cross: int = 0
    macd_bear_cross: int = 0
    gap_up: int = 0
    gap_down: int = 0
    volume_spike: int = 0


class FieldDef(BaseModel):
    key: str
    label: str
    group: str
    type: Literal["number"] = "number"
    unit: Optional[str] = None
    desc: Optional[str] = None


class Filter(BaseModel):
    field: str = Field(description="Metric key to filter on (see GET /api/fields), e.g. 'rsi_14'.")
    op: Operator = Field(description="Comparison operator. 'between' uses value..value2.")
    value: float = Field(default=0, description="Threshold value (lower bound for 'between').")
    value2: Optional[float] = Field(default=None, description="Upper bound, only for op='between'.")

    model_config = {
        "json_schema_extra": {
            "examples": [{"field": "rsi_14", "op": "lt", "value": 30}]
        }
    }


class ScreenRequest(BaseModel):
    filters: list[Filter] = Field(default_factory=list, description="Numeric conditions to apply.")
    logic: Logic = Field(default="AND", description="Combine filters with AND (all) or OR (any).")
    exchange: Optional[Exchange] = Field(default=None, description="Restrict to NSE or BSE.")
    segments: Optional[list[str]] = Field(
        default=None, description="Keep only these segments, e.g. ['EQ']. Null = all."
    )
    query: Optional[str] = Field(default=None, description="Free-text match on symbol/name.")
    sort_by: str = Field(default="market_cap_cr", description="Metric key to sort by.")
    sort_dir: Literal["asc", "desc"] = Field(default="desc", description="Sort direction.")
    limit: int = Field(default=200, description="Max rows to return.")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "filters": [
                        {"field": "rsi_14", "op": "lt", "value": 30},
                        {"field": "close", "op": "gte", "value": 100},
                    ],
                    "logic": "AND",
                    "exchange": "NSE",
                    "segments": ["EQ"],
                    "query": None,
                    "sort_by": "market_cap_cr",
                    "sort_dir": "desc",
                    "limit": 50,
                }
            ]
        }
    }


class ScreenResponse(BaseModel):
    count: int
    total_universe: int
    results: list[Metrics]


class SavedScreen(BaseModel):
    id: str
    name: str
    request: ScreenRequest
    created_at: str


class SaveScreenRequest(BaseModel):
    name: str = Field(description="Human-friendly name for the saved screen.")
    request: ScreenRequest = Field(description="The screen definition to persist.")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Oversold large caps",
                    "request": {
                        "filters": [{"field": "rsi_14", "op": "lt", "value": 30}],
                        "logic": "AND",
                        "exchange": "NSE",
                        "segments": ["EQ"],
                        "sort_by": "market_cap_cr",
                        "sort_dir": "desc",
                        "limit": 50,
                    },
                }
            ]
        }
    }
