"use client";

import type {
  DashboardStats,
  PerformanceByDay,
  PerformanceByHour,
  PerformanceBySetup,
  PerformanceBySymbol,
} from "./models";
import { formatCurrencyValue, type SupportedCurrency } from "./user-settings";

interface PerformanceBySide {
  side: string;
  pnl: number;
  trades: number;
  winRate: number;
}

interface MonthlyPerformancePoint {
  month: string;
  pnl: number;
  trades: number;
  winRate: number;
}

interface WinLossDistributionPoint {
  range: string;
  count: number;
}

export interface TradingReportExportPayload {
  stats: DashboardStats | null;
  performanceByDay: PerformanceByDay[];
  performanceByHour: PerformanceByHour[];
  performanceBySymbol: PerformanceBySymbol[];
  performanceBySetup: PerformanceBySetup[];
  performanceBySide: PerformanceBySide[];
  monthlyPerformance: MonthlyPerformancePoint[];
  winLossDistribution: WinLossDistributionPoint[];
  displayCurrency: SupportedCurrency;
}

function formatCurrency(value: number, currency: SupportedCurrency): string {
  return formatCurrencyValue(value, currency, {
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE").format(value);
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function getLastAutoTableY(doc: unknown): number | null {
  const candidate = doc as { lastAutoTable?: { finalY?: number } };
  if (typeof candidate.lastAutoTable?.finalY === "number") {
    return candidate.lastAutoTable.finalY;
  }
  return null;
}

export async function exportTradingReportPdf(payload: TradingReportExportPayload): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 44;
  const topY = 56;
  const contentWidth = pageWidth - marginX * 2;
  const cardGap = 12;
  const cardWidth = (contentWidth - cardGap) / 2;

  const exportTimestamp = new Date();
  const exportLabel = exportTimestamp.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const strongestHour = [...payload.performanceByHour].sort((left, right) => right.pnl - left.pnl)[0] ?? null;
  const strongestDay = [...payload.performanceByDay].sort((left, right) => right.pnl - left.pnl)[0] ?? null;
  const bestSymbol = payload.performanceBySymbol[0] ?? null;
  const bestSetup = payload.performanceBySetup[0] ?? null;
  const strongestMonth = [...payload.monthlyPerformance].sort((left, right) => right.pnl - left.pnl)[0] ?? null;
  const weakestMonth = [...payload.monthlyPerformance].sort((left, right) => left.pnl - right.pnl)[0] ?? null;

  doc.setFillColor(12, 18, 28);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setTextColor(227, 232, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("Trading Report", marginX, topY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(148, 163, 184);
  doc.text("Exportiert aus TradingHub", marginX, topY + 20);
  doc.text(`Stand: ${exportLabel}`, pageWidth - marginX, topY + 20, { align: "right" });

  doc.setTextColor(248, 250, 252);
  doc.setFontSize(13);
  doc.text("Performance-Schnellüberblick", marginX, topY + 56);

  const statCards = [
    {
      title: "Gesamt P&L",
      value: formatCurrency(payload.stats?.totalPnl ?? 0, payload.displayCurrency),
      detail: `${formatNumber(payload.stats?.totalTrades ?? 0)} Trades`,
    },
    {
      title: "Win Rate",
      value: formatPercent(payload.stats?.winRate ?? 0),
      detail: `Profit Factor ${(payload.stats?.profitFactor ?? 0).toFixed(2)}`,
    },
    {
      title: "Expectancy",
      value: formatCurrency(payload.stats?.expectancy ?? 0, payload.displayCurrency),
      detail: `Avg Hold ${Math.round(payload.stats?.avgHoldTime ?? 0)} Min`,
    },
    {
      title: "Max Drawdown",
      value: formatPercent(payload.stats?.maxDrawdown ?? 0),
      detail: `Sharpe ${(payload.stats?.sharpeRatio ?? 0).toFixed(2)}`,
    },
  ];

  const cardY = topY + 70;
  statCards.forEach((card, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = marginX + column * (cardWidth + cardGap);
    const y = cardY + row * 84;

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(x, y, cardWidth, 72, 10, 10, "F");
    doc.setDrawColor(30, 41, 59);
    doc.roundedRect(x, y, cardWidth, 72, 10, 10, "S");

    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(card.title, x + 14, y + 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(248, 250, 252);
    doc.text(card.value, x + 14, y + 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(card.detail, x + 14, y + 58);
  });

  const sectionY = cardY + 182;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(248, 250, 252);
  doc.text("Highlights", marginX, sectionY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(203, 213, 225);

  const highlights = [
    strongestHour ? `Beste Stunde: ${strongestHour.hour}:00 mit ${formatCurrency(strongestHour.pnl, payload.displayCurrency)}` : "Beste Stunde: keine Daten",
    strongestDay ? `Bester Wochentag: ${strongestDay.dayName} mit ${formatCurrency(strongestDay.pnl, payload.displayCurrency)}` : "Bester Wochentag: keine Daten",
    bestSymbol ? `Bestes Symbol: ${bestSymbol.symbol} mit ${formatCurrency(bestSymbol.pnl, payload.displayCurrency)}` : "Bestes Symbol: keine Daten",
    bestSetup ? `Bestes Setup: ${bestSetup.setup} mit ${formatCurrency(bestSetup.pnl, payload.displayCurrency)}` : "Bestes Setup: keine Daten",
    strongestMonth ? `Stärkster Monat: ${formatMonthLabel(strongestMonth.month)} mit ${formatCurrency(strongestMonth.pnl, payload.displayCurrency)}` : "Stärkster Monat: keine Daten",
    weakestMonth ? `Schwächster Monat: ${formatMonthLabel(weakestMonth.month)} mit ${formatCurrency(weakestMonth.pnl, payload.displayCurrency)}` : "Schwächster Monat: keine Daten",
  ];

  highlights.forEach((line, index) => {
    doc.text(`- ${line}`, marginX, sectionY + 22 + index * 16);
  });

  const tableTheme = {
    fillColor: [15, 23, 42] as [number, number, number],
    textColor: [226, 232, 240] as [number, number, number],
    lineColor: [30, 41, 59] as [number, number, number],
  };

  autoTable(doc, {
    startY: sectionY + 128,
    head: [["Zeit-Performance", "Trades", "Win Rate", "P&L"]],
    body: payload.performanceByHour.map((row) => [
      `${row.hour}:00 - ${row.hour}:59`,
      formatNumber(row.trades),
      formatPercent(row.winRate),
      formatCurrency(row.pnl, payload.displayCurrency),
    ]),
    theme: "grid",
    headStyles: tableTheme,
    bodyStyles: {
      fillColor: [10, 15, 26],
      textColor: [226, 232, 240],
      lineColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [12, 18, 28],
    },
    margin: { left: marginX, right: marginX },
  });

  autoTable(doc, {
    startY: (getLastAutoTableY(doc) ?? 216) + 24,
    head: [["Wochentag", "Trades", "Win Rate", "P&L"]],
    body: payload.performanceByDay.map((row) => [
      row.dayName,
      formatNumber(row.trades),
      formatPercent(row.winRate),
      formatCurrency(row.pnl, payload.displayCurrency),
    ]),
    theme: "grid",
    headStyles: tableTheme,
    bodyStyles: {
      fillColor: [10, 15, 26],
      textColor: [226, 232, 240],
      lineColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [12, 18, 28],
    },
    margin: { left: marginX, right: marginX },
  });

  doc.addPage();
  doc.setFillColor(12, 18, 28);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(248, 250, 252);
  doc.text("Symbole und Setups", marginX, topY);

  autoTable(doc, {
    startY: topY + 22,
    head: [["Symbol", "Trades", "Win Rate", "Avg P&L", "Total P&L"]],
    body: payload.performanceBySymbol.slice(0, 12).map((row) => [
      row.symbol,
      formatNumber(row.trades),
      formatPercent(row.winRate),
      formatCurrency(row.avgPnl, payload.displayCurrency),
      formatCurrency(row.pnl, payload.displayCurrency),
    ]),
    theme: "grid",
    headStyles: tableTheme,
    bodyStyles: {
      fillColor: [10, 15, 26],
      textColor: [226, 232, 240],
      lineColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [12, 18, 28],
    },
    margin: { left: marginX, right: marginX },
  });

  autoTable(doc, {
    startY: (getLastAutoTableY(doc) ?? 196) + 24,
    head: [["Setup", "Trades", "Win Rate", "Avg P&L", "Total P&L"]],
    body: payload.performanceBySetup.slice(0, 12).map((row) => [
      row.setup,
      formatNumber(row.trades),
      formatPercent(row.winRate),
      formatCurrency(row.avgPnl, payload.displayCurrency),
      formatCurrency(row.pnl, payload.displayCurrency),
    ]),
    theme: "grid",
    headStyles: tableTheme,
    bodyStyles: {
      fillColor: [10, 15, 26],
      textColor: [226, 232, 240],
      lineColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [12, 18, 28],
    },
    margin: { left: marginX, right: marginX },
  });

  const summaryY = (getLastAutoTableY(doc) ?? 360) + 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(248, 250, 252);
  doc.text("Long / Short", marginX, summaryY);

  payload.performanceBySide.forEach((side, index) => {
    const y = summaryY + 24 + index * 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `${side.side}: ${formatCurrency(side.pnl, payload.displayCurrency)} | ${formatNumber(side.trades)} Trades | ${formatPercent(side.winRate)}`,
      marginX,
      y
    );
  });

  doc.addPage();
  doc.setFillColor(12, 18, 28);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(248, 250, 252);
  doc.text("Monate und Verteilung", marginX, topY);

  autoTable(doc, {
    startY: topY + 22,
    head: [["Monat", "Trades", "Win Rate", "P&L"]],
    body: payload.monthlyPerformance.map((row) => [
      formatMonthLabel(row.month),
      formatNumber(row.trades),
      formatPercent(row.winRate),
      formatCurrency(row.pnl, payload.displayCurrency),
    ]),
    theme: "grid",
    headStyles: tableTheme,
    bodyStyles: {
      fillColor: [10, 15, 26],
      textColor: [226, 232, 240],
      lineColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [12, 18, 28],
    },
    margin: { left: marginX, right: marginX },
  });

  autoTable(doc, {
    startY: (getLastAutoTableY(doc) ?? 226) + 24,
    head: [["P&L Bereich", "Anzahl Trades"]],
    body: payload.winLossDistribution.map((row) => [row.range, formatNumber(row.count)]),
    theme: "grid",
    headStyles: tableTheme,
    bodyStyles: {
      fillColor: [10, 15, 26],
      textColor: [226, 232, 240],
      lineColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [12, 18, 28],
    },
    margin: { left: marginX, right: marginX },
  });

  const footerY = pageHeight - 28;
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("TradingHub PDF Export", marginX, footerY);
    doc.text(`Seite ${page} / ${pageCount}`, pageWidth - marginX, footerY, { align: "right" });
  }

  const filename = `trading-report-${sanitizeFilenamePart(exportTimestamp.toISOString().slice(0, 10))}.pdf`;
  doc.save(filename);
}
