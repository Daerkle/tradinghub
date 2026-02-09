"""
DEPRECATED: This Python scanner is no longer used by the Next.js application.
The scanner functionality has been moved to:
  - src/lib/scanner-service.ts (stock data fetching & analysis)
  - src/app/api/scanner/stream/route.ts (SSE streaming endpoint)
  - src/app/api/scanner/route.ts (REST API)

This file is kept for reference only and can be safely removed.

---
Original description:
Qullamaggie Scanner API - FastAPI Backend
Scans for: Episodic Pivots, 1M/3M/6M Momentum Leaders
Includes: News, EPS, Ratings, and Key Metrics
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed
import asyncio
import aiohttp
import json

app = FastAPI(title="Qullamaggie Scanner API", version="1.0.0")

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# Models
# =====================================================

class StockData(BaseModel):
    symbol: str
    name: str
    price: float
    change_percent: float
    volume: int
    avg_volume: int
    volume_ratio: float
    market_cap: Optional[float] = None
    # Momentum metrics
    momentum_1m: Optional[float] = None
    momentum_3m: Optional[float] = None
    momentum_6m: Optional[float] = None
    # Technical metrics
    rsi: Optional[float] = None
    adr_percent: Optional[float] = None
    distance_from_20sma: Optional[float] = None
    distance_from_50sma: Optional[float] = None
    distance_from_52w_high: Optional[float] = None
    # Moving averages
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    sma_150: Optional[float] = None
    sma_200: Optional[float] = None
    # Fundamentals
    eps: Optional[float] = None
    eps_growth: Optional[float] = None
    revenue_growth: Optional[float] = None
    pe_ratio: Optional[float] = None
    # Ratings
    analyst_rating: Optional[str] = None
    target_price: Optional[float] = None
    # EP specific
    gap_percent: Optional[float] = None
    is_ep_candidate: bool = False
    # Metadata
    sector: Optional[str] = None
    industry: Optional[str] = None
    last_updated: str = ""

class ScannerResult(BaseModel):
    scan_type: str
    results: List[StockData]
    count: int
    timestamp: str

class NewsItem(BaseModel):
    title: str
    url: str
    source: str
    published: str
    summary: Optional[str] = None

# =====================================================
# Stock Universe - US Large/Mid Caps + High Volume
# =====================================================

def get_stock_universe() -> List[str]:
    """Get list of stocks to scan - US equities with sufficient liquidity"""
    # S&P 500 + NASDAQ 100 + High volume mid-caps
    # In production, this would come from a database or API
    major_stocks = [
        # Tech Giants
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD", "INTC", "CRM",
        "ORCL", "ADBE", "NFLX", "PYPL", "SQ", "SHOP", "SNOW", "PLTR", "COIN", "RBLX",
        # Semis
        "AVGO", "QCOM", "TXN", "MU", "MRVL", "LRCX", "AMAT", "KLAC", "ASML", "ARM",
        # Software/Cloud
        "NOW", "WDAY", "ZS", "CRWD", "PANW", "DDOG", "NET", "OKTA", "MDB", "SPLK",
        # Healthcare/Biotech
        "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
        "MRNA", "BNTX", "REGN", "VRTX", "GILD", "BIIB", "AMGN", "ILMN", "ISRG", "DXCM",
        # Finance
        "JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP", "V", "MA",
        # Consumer
        "WMT", "COST", "HD", "LOW", "TGT", "NKE", "SBUX", "MCD", "YUM", "CMG",
        # Energy
        "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "VLO", "MPC", "DVN",
        # Industrial
        "CAT", "DE", "BA", "LMT", "RTX", "GE", "HON", "UPS", "FDX", "UNP",
        # Auto/EV
        "GM", "F", "RIVN", "LCID", "NIO", "LI", "XPEV",
        # AI/Emerging
        "SMCI", "VRT", "DELL", "HPE", "IONQ", "RGTI", "QUBT",
        # Retail/E-commerce
        "ETSY", "EBAY", "W", "CHWY", "DASH", "UBER", "LYFT", "ABNB",
        # Crypto-related
        "MSTR", "MARA", "RIOT", "CLSK", "HUT",
        # Entertainment
        "DIS", "CMCSA", "WBD", "PARA", "SPOT", "ROKU",
        # Communications
        "T", "VZ", "TMUS",
        # More momentum stocks
        "APP", "TTD", "DUOL", "CELH", "HIMS", "ONON", "DECK", "LULU", "BIRD",
        "AFRM", "SOFI", "HOOD", "UPST", "NU", "GRAB"
    ]
    return list(set(major_stocks))

# =====================================================
# Scanner Functions
# =====================================================

def calculate_rsi(prices: pd.Series, period: int = 14) -> float:
    """Calculate RSI indicator"""
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else None

def calculate_adr_percent(high: pd.Series, low: pd.Series, period: int = 20) -> float:
    """Calculate Average Daily Range in %"""
    daily_range = ((high - low) / low * 100)
    adr = daily_range.rolling(window=period).mean()
    return float(adr.iloc[-1]) if not pd.isna(adr.iloc[-1]) else None

def get_stock_data(symbol: str) -> Optional[StockData]:
    """Fetch comprehensive stock data for a single symbol"""
    try:
        ticker = yf.Ticker(symbol)

        # Get historical data (6 months + buffer)
        hist = ticker.history(period="9mo")
        if hist.empty or len(hist) < 50:
            return None

        info = ticker.info

        # Current price and change
        current_price = hist['Close'].iloc[-1]
        prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        change_percent = ((current_price - prev_close) / prev_close) * 100

        # Volume metrics
        current_volume = int(hist['Volume'].iloc[-1])
        avg_volume = int(hist['Volume'].tail(50).mean())
        volume_ratio = current_volume / avg_volume if avg_volume > 0 else 0

        # Calculate SMAs
        sma_20 = float(hist['Close'].tail(20).mean()) if len(hist) >= 20 else None
        sma_50 = float(hist['Close'].tail(50).mean()) if len(hist) >= 50 else None
        sma_150 = float(hist['Close'].tail(150).mean()) if len(hist) >= 150 else None
        sma_200 = float(hist['Close'].tail(200).mean()) if len(hist) >= 200 else None

        # Distance from MAs
        distance_20sma = ((current_price - sma_20) / sma_20 * 100) if sma_20 else None
        distance_50sma = ((current_price - sma_50) / sma_50 * 100) if sma_50 else None

        # 52-week high distance
        high_52w = hist['High'].tail(252).max() if len(hist) >= 252 else hist['High'].max()
        distance_52w_high = ((current_price - high_52w) / high_52w * 100)

        # Momentum calculations (% return)
        if len(hist) >= 21:
            momentum_1m = ((current_price - hist['Close'].iloc[-21]) / hist['Close'].iloc[-21]) * 100
        else:
            momentum_1m = None

        if len(hist) >= 63:
            momentum_3m = ((current_price - hist['Close'].iloc[-63]) / hist['Close'].iloc[-63]) * 100
        else:
            momentum_3m = None

        if len(hist) >= 126:
            momentum_6m = ((current_price - hist['Close'].iloc[-126]) / hist['Close'].iloc[-126]) * 100
        else:
            momentum_6m = None

        # RSI
        rsi = calculate_rsi(hist['Close'])

        # ADR%
        adr_percent = calculate_adr_percent(hist['High'], hist['Low'])

        # Gap detection for EP (today's open vs yesterday's close)
        if len(hist) >= 2:
            today_open = hist['Open'].iloc[-1]
            yesterday_close = hist['Close'].iloc[-2]
            gap_percent = ((today_open - yesterday_close) / yesterday_close) * 100
        else:
            gap_percent = 0

        # EP candidate check (gap >= 10%, volume 2x+ average)
        is_ep_candidate = gap_percent >= 10 and volume_ratio >= 2.0

        # Fundamentals from info
        eps = info.get('trailingEps')
        eps_growth = info.get('earningsQuarterlyGrowth', 0)
        if eps_growth:
            eps_growth = eps_growth * 100  # Convert to percentage
        revenue_growth = info.get('revenueGrowth', 0)
        if revenue_growth:
            revenue_growth = revenue_growth * 100
        pe_ratio = info.get('trailingPE')
        market_cap = info.get('marketCap')

        # Analyst info
        analyst_rating = info.get('recommendationKey', '').upper()
        target_price = info.get('targetMeanPrice')

        return StockData(
            symbol=symbol,
            name=info.get('shortName', symbol),
            price=round(current_price, 2),
            change_percent=round(change_percent, 2),
            volume=current_volume,
            avg_volume=avg_volume,
            volume_ratio=round(volume_ratio, 2),
            market_cap=market_cap,
            momentum_1m=round(momentum_1m, 2) if momentum_1m else None,
            momentum_3m=round(momentum_3m, 2) if momentum_3m else None,
            momentum_6m=round(momentum_6m, 2) if momentum_6m else None,
            rsi=round(rsi, 2) if rsi else None,
            adr_percent=round(adr_percent, 2) if adr_percent else None,
            distance_from_20sma=round(distance_20sma, 2) if distance_20sma else None,
            distance_from_50sma=round(distance_50sma, 2) if distance_50sma else None,
            distance_from_52w_high=round(distance_52w_high, 2) if distance_52w_high else None,
            sma_20=round(sma_20, 2) if sma_20 else None,
            sma_50=round(sma_50, 2) if sma_50 else None,
            sma_150=round(sma_150, 2) if sma_150 else None,
            sma_200=round(sma_200, 2) if sma_200 else None,
            eps=round(eps, 2) if eps else None,
            eps_growth=round(eps_growth, 2) if eps_growth else None,
            revenue_growth=round(revenue_growth, 2) if revenue_growth else None,
            pe_ratio=round(pe_ratio, 2) if pe_ratio else None,
            analyst_rating=analyst_rating,
            target_price=round(target_price, 2) if target_price else None,
            gap_percent=round(gap_percent, 2),
            is_ep_candidate=is_ep_candidate,
            sector=info.get('sector'),
            industry=info.get('industry'),
            last_updated=datetime.now().isoformat()
        )
    except Exception as e:
        print(f"Error fetching {symbol}: {e}")
        return None

def scan_stocks_parallel(symbols: List[str], max_workers: int = 10) -> List[StockData]:
    """Scan multiple stocks in parallel"""
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(get_stock_data, symbol): symbol for symbol in symbols}
        for future in as_completed(futures):
            result = future.result()
            if result:
                results.append(result)
    return results

# =====================================================
# API Endpoints
# =====================================================

@app.get("/")
async def root():
    return {"message": "Qullamaggie Scanner API", "version": "1.0.0"}

@app.get("/api/scan/ep", response_model=ScannerResult)
async def scan_episodic_pivots(
    min_gap: float = Query(10.0, description="Minimum gap percentage"),
    min_volume_ratio: float = Query(2.0, description="Minimum volume ratio vs average")
):
    """
    Scan for Episodic Pivot candidates
    Criteria:
    - Gap up >= 10% (or custom)
    - Volume >= 2x average (or custom)
    - Story change (earnings, news, etc.)
    """
    symbols = get_stock_universe()
    all_data = scan_stocks_parallel(symbols)

    # Filter for EP candidates
    ep_stocks = [
        stock for stock in all_data
        if stock.gap_percent >= min_gap and stock.volume_ratio >= min_volume_ratio
    ]

    # Sort by gap percentage descending
    ep_stocks.sort(key=lambda x: x.gap_percent, reverse=True)

    return ScannerResult(
        scan_type="Episodic Pivot (EP)",
        results=ep_stocks[:50],  # Top 50
        count=len(ep_stocks),
        timestamp=datetime.now().isoformat()
    )

@app.get("/api/scan/momentum/{period}", response_model=ScannerResult)
async def scan_momentum(
    period: str,
    min_momentum: float = Query(0.0, description="Minimum momentum percentage"),
    min_volume: int = Query(500000, description="Minimum average volume"),
    limit: int = Query(50, description="Number of results to return")
):
    """
    Scan for top momentum stocks
    Periods: 1m, 3m, 6m
    Returns top performers by momentum in the selected timeframe
    """
    if period not in ["1m", "3m", "6m"]:
        raise HTTPException(status_code=400, detail="Period must be 1m, 3m, or 6m")

    symbols = get_stock_universe()
    all_data = scan_stocks_parallel(symbols)

    # Filter by minimum volume
    filtered = [s for s in all_data if s.avg_volume >= min_volume]

    # Get momentum field
    momentum_field = f"momentum_{period}"

    # Filter stocks with valid momentum data and minimum threshold
    momentum_stocks = [
        stock for stock in filtered
        if getattr(stock, momentum_field) is not None
        and getattr(stock, momentum_field) >= min_momentum
    ]

    # Sort by momentum descending
    momentum_stocks.sort(key=lambda x: getattr(x, momentum_field) or 0, reverse=True)

    period_labels = {"1m": "1 Month", "3m": "3 Month", "6m": "6 Month"}

    return ScannerResult(
        scan_type=f"Qullamaggie {period_labels[period]} Momentum",
        results=momentum_stocks[:limit],
        count=len(momentum_stocks),
        timestamp=datetime.now().isoformat()
    )

@app.get("/api/scan/qullamaggie", response_model=ScannerResult)
async def scan_qullamaggie_setup(
    limit: int = Query(50, description="Number of results")
):
    """
    Qullamaggie Setup Scanner
    Criteria:
    - Price > 200 SMA
    - 150 SMA > 200 SMA
    - 50 SMA > 150 SMA
    - Close > 30% above 52-week low
    - Close within 25% of 52-week high
    - ADR% > 5%
    - RSI > 50
    """
    symbols = get_stock_universe()
    all_data = scan_stocks_parallel(symbols)

    qualified = []
    for stock in all_data:
        # Skip if missing required data
        if not all([stock.sma_50, stock.sma_150, stock.sma_200, stock.adr_percent, stock.rsi]):
            continue

        # Qullamaggie conditions
        conditions = [
            stock.price > stock.sma_200,  # Price above 200 SMA
            stock.sma_150 > stock.sma_200 if stock.sma_150 else False,  # 150 > 200
            stock.sma_50 > (stock.sma_150 or 0),  # 50 > 150
            stock.distance_from_52w_high and stock.distance_from_52w_high >= -25,  # Within 25% of 52w high
            stock.adr_percent and stock.adr_percent >= 5,  # ADR% >= 5 (momentum stock)
            stock.rsi and stock.rsi >= 50,  # RSI above 50 (bullish)
            stock.avg_volume >= 500000  # Sufficient liquidity
        ]

        if all(conditions):
            qualified.append(stock)

    # Sort by 1-month momentum
    qualified.sort(key=lambda x: x.momentum_1m or 0, reverse=True)

    return ScannerResult(
        scan_type="Qullamaggie Breakout Setup",
        results=qualified[:limit],
        count=len(qualified),
        timestamp=datetime.now().isoformat()
    )

@app.get("/api/scan/all", response_model=Dict[str, ScannerResult])
async def scan_all():
    """Run all scans and return combined results"""
    symbols = get_stock_universe()
    all_data = scan_stocks_parallel(symbols, max_workers=15)

    # EP Scan
    ep_stocks = [s for s in all_data if s.gap_percent >= 10 and s.volume_ratio >= 2.0]
    ep_stocks.sort(key=lambda x: x.gap_percent, reverse=True)

    # Momentum Scans
    def get_momentum_leaders(data: List[StockData], period: str, limit: int = 25):
        field = f"momentum_{period}"
        filtered = [s for s in data if getattr(s, field) is not None and s.avg_volume >= 500000]
        filtered.sort(key=lambda x: getattr(x, field) or 0, reverse=True)
        return filtered[:limit]

    # Qullamaggie Setup
    qulla_setup = []
    for stock in all_data:
        if not all([stock.sma_50, stock.sma_150, stock.sma_200, stock.adr_percent, stock.rsi]):
            continue
        conditions = [
            stock.price > stock.sma_200,
            stock.sma_150 > stock.sma_200 if stock.sma_150 else False,
            stock.sma_50 > (stock.sma_150 or 0),
            stock.distance_from_52w_high and stock.distance_from_52w_high >= -25,
            stock.adr_percent and stock.adr_percent >= 5,
            stock.rsi and stock.rsi >= 50,
            stock.avg_volume >= 500000
        ]
        if all(conditions):
            qulla_setup.append(stock)
    qulla_setup.sort(key=lambda x: x.momentum_1m or 0, reverse=True)

    timestamp = datetime.now().isoformat()

    return {
        "ep": ScannerResult(
            scan_type="Episodic Pivot (EP)",
            results=ep_stocks[:25],
            count=len(ep_stocks),
            timestamp=timestamp
        ),
        "momentum_1m": ScannerResult(
            scan_type="1 Month Momentum Leaders",
            results=get_momentum_leaders(all_data, "1m"),
            count=len(get_momentum_leaders(all_data, "1m", 1000)),
            timestamp=timestamp
        ),
        "momentum_3m": ScannerResult(
            scan_type="3 Month Momentum Leaders",
            results=get_momentum_leaders(all_data, "3m"),
            count=len(get_momentum_leaders(all_data, "3m", 1000)),
            timestamp=timestamp
        ),
        "momentum_6m": ScannerResult(
            scan_type="6 Month Momentum Leaders",
            results=get_momentum_leaders(all_data, "6m"),
            count=len(get_momentum_leaders(all_data, "6m", 1000)),
            timestamp=timestamp
        ),
        "qullamaggie_setup": ScannerResult(
            scan_type="Qullamaggie Breakout Setup",
            results=qulla_setup[:25],
            count=len(qulla_setup),
            timestamp=timestamp
        )
    }

@app.get("/api/stock/{symbol}", response_model=StockData)
async def get_single_stock(symbol: str):
    """Get detailed data for a single stock"""
    data = get_stock_data(symbol.upper())
    if not data:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")
    return data

@app.get("/api/news/{symbol}", response_model=List[NewsItem])
async def get_stock_news(symbol: str, limit: int = Query(10, description="Number of news items")):
    """Get recent news for a stock using yfinance"""
    try:
        ticker = yf.Ticker(symbol.upper())
        news = ticker.news[:limit] if ticker.news else []

        news_items = []
        for item in news:
            news_items.append(NewsItem(
                title=item.get('title', ''),
                url=item.get('link', ''),
                source=item.get('publisher', ''),
                published=datetime.fromtimestamp(item.get('providerPublishTime', 0)).isoformat(),
                summary=item.get('summary', item.get('title', ''))[:500]
            ))

        return news_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# =====================================================
# Run Server
# =====================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
