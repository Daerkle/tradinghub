"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  CandlestickSeries,
  HistogramSeries,
  Time,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Clock, Timer } from "lucide-react";

interface ChartData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SetupChartProps {
  symbol: string;
  setupDate: string;
  daily: ChartData[];
  hourly: ChartData[];
  fiveMin: ChartData[];
  entryPrice?: number;
  stopPrice?: number;
}

type Timeframe = "daily" | "hourly" | "5min";

export function SetupChart({
  symbol,
  setupDate,
  daily,
  hourly,
  fiveMin,
  entryPrice,
  stopPrice,
}: SetupChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("daily");

  const getData = () => {
    switch (timeframe) {
      case "hourly":
        return hourly;
      case "5min":
        return fiveMin;
      default:
        return daily;
    }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.05)" },
        horzLines: { color: "rgba(255, 255, 255, 0.05)" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        timeVisible: timeframe !== "daily",
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
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

    // Add volume series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#6366f1",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [timeframe]);

  // Update data when timeframe changes
  useEffect(() => {
    const data = getData();

    if (candleSeriesRef.current && data.length > 0) {
      const candleData: CandlestickData<Time>[] = data.map((d) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      candleSeriesRef.current.setData(candleData);

      // Add entry price line
      if (entryPrice) {
        candleSeriesRef.current.createPriceLine({
          price: entryPrice,
          color: "#22c55e",
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: "Entry",
        });
      }

      // Add stop price line
      if (stopPrice) {
        candleSeriesRef.current.createPriceLine({
          price: stopPrice,
          color: "#ef4444",
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "Stop",
        });
      }
    }

    if (volumeSeriesRef.current && data.length > 0) {
      const volumeData: HistogramData<Time>[] = data.map((d) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    // Fit content
    if (chartRef.current && data.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [timeframe, daily, hourly, fiveMin, setupDate, entryPrice, stopPrice]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{symbol} Chart</CardTitle>
          <div className="flex gap-1">
            <Button
              variant={timeframe === "daily" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeframe("daily")}
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Daily
            </Button>
            <Button
              variant={timeframe === "hourly" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeframe("hourly")}
              disabled={hourly.length === 0}
            >
              <Clock className="h-4 w-4 mr-1" />
              60min
            </Button>
            <Button
              variant={timeframe === "5min" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeframe("5min")}
              disabled={fiveMin.length === 0}
            >
              <Timer className="h-4 w-4 mr-1" />
              5min
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartContainerRef} className="w-full" />
        {(timeframe === "hourly" && hourly.length === 0) ||
        (timeframe === "5min" && fiveMin.length === 0) ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <p className="text-muted-foreground">
              Intraday Daten werden geladen...
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
