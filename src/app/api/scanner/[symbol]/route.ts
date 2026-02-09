import { NextRequest, NextResponse } from "next/server";
import { fetchStockData, fetchStockNews, applyCatalystMetrics, buildStockFromFinvizData } from "@/lib/scanner-service";
import { fetchFinvizDataCached } from "@/lib/finviz-service";
import { symbolRateLimit } from "@/lib/rate-limiter";

function isSameUtcDay(date: Date, reference: Date = new Date()): boolean {
  return (
    date.getUTCFullYear() === reference.getUTCFullYear() &&
    date.getUTCMonth() === reference.getUTCMonth() &&
    date.getUTCDate() === reference.getUTCDate()
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = symbolRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { symbol } = await params;

  try {
    // Fetch stock data from Yahoo Finance
    let stockData = await fetchStockData(symbol.toUpperCase());

    // Fetch additional Finviz data (also used as fallback when Yahoo is unavailable)
    const finvizData = await fetchFinvizDataCached(symbol.toUpperCase());

    if (!stockData && finvizData) {
      stockData = buildStockFromFinvizData(symbol.toUpperCase(), finvizData);
    }

    if (!stockData) {
      return NextResponse.json(
        { error: "Stock not found or insufficient data" },
        { status: 404 }
      );
    }

    // Merge Finviz data if available
    if (finvizData) {
      stockData.shortFloat = finvizData.shortFloat;
      stockData.insiderOwn = finvizData.insiderOwn;
      stockData.instOwn = finvizData.instOwn;
      stockData.shortRatio = finvizData.shortRatio;
      stockData.peg = finvizData.peg;
      stockData.priceToSales = finvizData.priceToSales;
      stockData.priceToBook = finvizData.priceToBook;
      stockData.beta = finvizData.beta;
      stockData.atr = finvizData.atr;
      stockData.relativeVolume = finvizData.relativeVolume;
      stockData.profitMargin = finvizData.profitMargin;
      stockData.operMargin = finvizData.operMargin;
      stockData.grossMargin = finvizData.grossMargin;
      stockData.returnOnEquity = finvizData.returnOnEquity;
      stockData.returnOnAssets = finvizData.returnOnAssets;
      stockData.epsGrowthThisYear = finvizData.epsGrowthThisYear;
      stockData.epsGrowthNextYear = finvizData.epsGrowthNextYear;
      stockData.epsGrowthNext5Y = finvizData.epsGrowthNext5Y;
      stockData.salesGrowthQoQ = finvizData.salesGrowthQoQ;
      stockData.earningsDate = finvizData.earningsDate;
      // Override with Finviz data if available
      if (finvizData.targetPrice) stockData.targetPrice = finvizData.targetPrice;
      if (finvizData.analystRecom) stockData.analystRating = finvizData.analystRecom;
    }

    // Fetch news
    const news = await fetchStockNews(symbol.toUpperCase());
    stockData.news = news;
    stockData.todayNewsCount = news.filter((item) => isSameUtcDay(new Date(item.publishedAt))).length;

    return NextResponse.json(applyCatalystMetrics(stockData));
  } catch (error) {
    console.error("Scanner API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
