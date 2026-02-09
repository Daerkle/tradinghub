"use client";

import { useEffect, useRef, memo } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  CandlestickData,
  LineData,
  Time
} from "lightweight-charts";
import type { CandleData } from "@/types/scanner";

interface StockChartProps {
  data: CandleData[];
  ema10?: number[];
  ema20?: number[];
  ema50?: number[];
  ema200?: number[];
  symbol: string;
  height?: number;
}

function StockChartComponent({ data, symbol, height = 300 }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema10SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(42, 46, 57, 0.3)" },
        horzLines: { color: "rgba(42, 46, 57, 0.3)" },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#666666",
          width: 1,
          style: 2,
          labelBackgroundColor: "#444444",
        },
        horzLine: {
          color: "#666666",
          width: 1,
          style: 2,
          labelBackgroundColor: "#444444",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(42, 46, 57, 0.3)",
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: "rgba(42, 46, 57, 0.3)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
    });

    chartRef.current = chart;

    // Add candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeriesRef.current = candleSeries;

    // Format data for lightweight-charts
    const candleData: CandlestickData<Time>[] = data.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeries.setData(candleData);

    // Calculate EMAs from candle data
    const closes = data.map((d) => d.close);

    const calculateEMAData = (period: number): LineData<Time>[] => {
      if (closes.length < period) return [];
      const multiplier = 2 / (period + 1);
      let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const result: LineData<Time>[] = [];

      for (let i = period - 1; i < closes.length; i++) {
        if (i >= period) {
          ema = (closes[i] - ema) * multiplier + ema;
        }
        result.push({
          time: data[i].time as Time,
          value: ema,
        });
      }
      return result;
    };

    // Add EMA 10 (light gray)
    const ema10Series = chart.addSeries(LineSeries, {
      color: "#a0a0a0",
      lineWidth: 1,
      title: "EMA 10",
    });
    ema10SeriesRef.current = ema10Series;
    ema10Series.setData(calculateEMAData(10));

    // Add EMA 20 (medium gray)
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#787878",
      lineWidth: 1,
      title: "EMA 20",
    });
    ema20SeriesRef.current = ema20Series;
    ema20Series.setData(calculateEMAData(20));

    // Add EMA 50 (darker gray)
    const ema50Series = chart.addSeries(LineSeries, {
      color: "#555555",
      lineWidth: 1,
      title: "EMA 50",
    });
    ema50SeriesRef.current = ema50Series;
    ema50Series.setData(calculateEMAData(50));

    // Add EMA 200 (darkest gray, thicker)
    const ema200Series = chart.addSeries(LineSeries, {
      color: "#383838",
      lineWidth: 2,
      title: "EMA 200",
    });
    ema200SeriesRef.current = ema200Series;
    ema200Series.setData(calculateEMAData(200));

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height]);

  return (
    <div className="relative">
      <div className="absolute top-2 left-2 z-10 flex gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">EMA 10</span>
        <span className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">EMA 20</span>
        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">EMA 50</span>
        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-600">EMA 200</span>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}

export const StockChart = memo(StockChartComponent);
