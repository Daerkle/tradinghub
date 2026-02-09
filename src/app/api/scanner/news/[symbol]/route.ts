import { NextRequest, NextResponse } from "next/server";
import { fetchStockNews } from "@/lib/scanner-service";

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
  const { symbol } = await params;
  const todayOnly =
    request.nextUrl.searchParams.get("today") === "true" ||
    request.nextUrl.searchParams.get("range") === "today";
  const maxRaw = Number.parseInt(request.nextUrl.searchParams.get("max") || "10", 10);
  const maxItems = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(maxRaw, 50) : 10;

  try {
    const allNews = await fetchStockNews(symbol.toUpperCase(), {
      todayOnly: false,
      maxItems: 50,
    });
    const todayNews = allNews.filter((item) => isSameUtcDay(new Date(item.publishedAt)));
    const selectedNews = (todayOnly ? todayNews : allNews).slice(0, maxItems);
    const tagCounts = selectedNews.reduce<Record<string, number>>((acc, item) => {
      for (const tag of item.tags || []) {
        acc[tag] = (acc[tag] || 0) + 1;
      }
      return acc;
    }, {});

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      news: selectedNews,
      todayNewsCount: todayNews.length,
      totalNewsCount: allNews.length,
      tagCounts,
      mode: todayOnly ? "today" : "all",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("News API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch news data" },
      { status: 500 }
    );
  }
}
