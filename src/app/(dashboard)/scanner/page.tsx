"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useScannerStream } from "@/hooks/use-scanner-stream";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { ScannerProgress } from "@/components/scanner/scanner-progress";
import { ScannerFilterBadges } from "@/components/scanner/scanner-filter-badges";
import { ScannerToolbar } from "@/components/scanner/scanner-toolbar";
import { ScannerInsights } from "@/components/scanner/scanner-insights";
import { ScannerSignals } from "@/components/scanner/scanner-signals";
import { StockTable } from "@/components/scanner/stock-table";
import { StockCardGrid } from "@/components/scanner/stock-card-grid";
import { CompactStockWatchlist, type CompactWatchlistItem } from "@/components/scanner/compact-stock-watchlist";
import { CompareView } from "@/components/scanner/compare-view";
import { filterByScanType } from "@/lib/scanner-filters";
import type { StockData } from "@/types/scanner";

type SortField = keyof StockData | "none";
type SortDirection = "asc" | "desc";

type ScannerBucketKey =
  | "all"
  | "ep"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "setup"
  | "stockbee"
  | "rs"
  | "minervini"
  | "canslim"
  | "chrisswings"
  | "squeeze"
  | "catalyst";

type ScannerBuckets = Record<ScannerBucketKey, StockData[]>;

const FILTER_BUCKETS: Array<[Exclude<ScannerBucketKey, "all">, string]> = [
  ["ep", "ep"],
  ["1m", "1m"],
  ["3m", "3m"],
  ["6m", "6m"],
  ["1y", "1y"],
  ["setup", "qullamaggie"],
  ["stockbee", "stockbee"],
  ["rs", "rs"],
  ["minervini", "minervini"],
  ["canslim", "canslim"],
  ["chrisswings", "chrisswings"],
  ["squeeze", "squeeze"],
  ["catalyst", "catalyst"],
];

const EMPTY_BUCKETS: ScannerBuckets = {
  all: [],
  ep: [],
  "1m": [],
  "3m": [],
  "6m": [],
  "1y": [],
  setup: [],
  stockbee: [],
  rs: [],
  minervini: [],
  canslim: [],
  chrisswings: [],
  squeeze: [],
  catalyst: [],
};

const TABLE_VISIBLE_STEP = 160;
const CARD_VISIBLE_STEP = 60;
const WATCHLIST_VISIBLE_STEP = 180;
const MOBILE_VISIBLE_STEP = 48;

function buildScannerBuckets(stocks: StockData[]): ScannerBuckets {
  if (stocks.length === 0) return EMPTY_BUCKETS;

  const buckets: ScannerBuckets = {
    ...EMPTY_BUCKETS,
    all: stocks,
  };

  for (const [key, filterType] of FILTER_BUCKETS) {
    buckets[key] = filterByScanType(stocks, filterType);
  }

  return buckets;
}

function getTabBucket(activeTab: string): ScannerBucketKey {
  return activeTab in EMPTY_BUCKETS ? (activeTab as ScannerBucketKey) : "all";
}

function searchStocks(data: StockData[], rawQuery: string): StockData[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return data;

  const symbolTokens = query
    .split(/[,\s]+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z0-9.-]{1,8}$/.test(token));

  if (symbolTokens.length >= 2) {
    const symbolSet = new Set(symbolTokens);
    return data.filter((stock) => symbolSet.has(stock.symbol.toUpperCase()));
  }

  return data.filter(
    (stock) =>
      stock.symbol.toLowerCase().includes(query) ||
      stock.name.toLowerCase().includes(query) ||
      stock.sector?.toLowerCase().includes(query) ||
      stock.industry?.toLowerCase().includes(query) ||
      stock.catalystSignals?.some((signal) => signal.toLowerCase().includes(query)) ||
      stock.scanTypes?.some((type) => type.toLowerCase().includes(query))
  );
}

function sortStocks(data: StockData[], sortField: SortField, sortDirection: SortDirection): StockData[] {
  if (sortField === "none" || data.length < 2) return data;

  return [...data].sort((a, b) => {
    const aVal = a[sortField as keyof StockData];
    const bVal = b[sortField as keyof StockData];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return 0;
  });
}

function scannerStockToWatchItem(stock: StockData): CompactWatchlistItem {
  return {
    symbol: stock.symbol,
    name: stock.name,
    href: `/scanner?symbol=${encodeURIComponent(stock.symbol)}`,
    price: stock.price,
    changePercent: stock.changePercent,
    volumeRatio: stock.volumeRatio,
    momentum1M: stock.momentum1M,
    momentum3M: stock.momentum3M,
    momentum6M: stock.momentum6M,
    momentum1Y: stock.momentum1Y,
    rsRating: stock.rsRating,
    catalystScore: stock.catalystScore,
    heatScore: Math.max(stock.industryHeatScore ?? 0, stock.sectorHeatScore ?? 0),
    score: stock.setupScore,
    sector: stock.sector,
    industry: stock.industry,
    tags: [
      stock.isEP ? "EP" : null,
      stock.isQullaSetup ? "Q" : null,
      stock.isStockbeeSetup ? "SB" : null,
      ...(stock.scanTypes ?? []),
    ].filter((tag): tag is string => Boolean(tag)),
  };
}

export default function ScannerPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [sortField, setSortField] = useState<SortField>("catalystScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [copiedList, setCopiedList] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showCompareView, setShowCompareView] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards" | "watchlist">("table");
  const [cardsPerRow, setCardsPerRow] = useState(4);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [visibleCount, setVisibleCount] = useState(TABLE_VISIBLE_STEP);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepLinkQuery = params.get("symbols") || params.get("symbol") || params.get("q");
    if (deepLinkQuery?.trim()) {
      setSearchQuery(deepLinkQuery.trim().toUpperCase());
    }
  }, []);

  const handleScanComplete = useCallback((stats: { totalStocks: number; fromCache: number }) => {
    setLastUpdated(new Date().toLocaleTimeString("de-DE"));
    console.log(`Scan complete: ${stats.totalStocks} stocks (${stats.fromCache} from cache)`);
  }, []);

  const handleScanError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  const {
    stocks: streamedStocks,
    progress: scanProgress,
    isLoading: loading,
    stats: scanStats,
    startScan,
    cancelScan,
    refresh,
  } = useScannerStream({
    scanType: "all",
    batchSize: 24,
    onComplete: handleScanComplete,
    onError: handleScanError,
  });

  useEffect(() => {
    startScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const syncViewport = () => {
      const mobile = media.matches;
      setIsMobileViewport(mobile);

      if (mobile) {
        setViewMode("watchlist");
        setCardsPerRow(2);
      }
    };

    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  const toggleRow = useCallback((symbol: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((currentDirection) => currentDirection === "asc" ? "desc" : "asc");
        return currentField;
      }

      setSortDirection("desc");
      return field;
    });
  }, []);

  const handleSelectForCompare = useCallback((symbol: string, selected: boolean) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (selected) next.add(symbol);
      else next.delete(symbol);
      return next;
    });
  }, []);

  const scannerBuckets = useMemo(() => buildScannerBuckets(streamedStocks), [streamedStocks]);
  const activeBucket = scannerBuckets[getTabBucket(activeTab)];
  const displayData = useMemo(
    () => sortStocks(searchStocks(activeBucket, deferredSearchQuery), sortField, sortDirection),
    [activeBucket, deferredSearchQuery, sortField, sortDirection]
  );
  const visibleStep = isMobileViewport ? MOBILE_VISIBLE_STEP : viewMode === "cards" ? CARD_VISIBLE_STEP : viewMode === "watchlist" ? WATCHLIST_VISIBLE_STEP : TABLE_VISIBLE_STEP;
  const visibleData = useMemo(() => displayData.slice(0, visibleCount), [displayData, visibleCount]);
  const handleSelectVisible = useCallback((selected: boolean) => {
    setSelectedForCompare(selected ? new Set(visibleData.map((stock) => stock.symbol)) : new Set());
  }, [visibleData]);
  const hasMoreResults = visibleData.length < displayData.length;
  const hasAnyStocks = streamedStocks.length > 0;
  const showInitialLoading = loading && !hasAnyStocks;

  useEffect(() => {
    setVisibleCount(isMobileViewport ? MOBILE_VISIBLE_STEP : viewMode === "cards" ? CARD_VISIBLE_STEP : viewMode === "watchlist" ? WATCHLIST_VISIBLE_STEP : TABLE_VISIBLE_STEP);
  }, [activeTab, deferredSearchQuery, isMobileViewport, sortDirection, sortField, viewMode]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Scanner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Momentum Leader, Swing-Setups und Breakout-Muster
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground sm:text-right">
              Zuletzt aktualisiert: {lastUpdated}
              {scanStats && scanStats.fromCache > 0 && ` (${scanStats.fromCache} aus Cache)`}
            </span>
          )}
          {loading && (
            <Button variant="outline" size="sm" onClick={cancelScan} className="w-full sm:w-auto">
              <span className="hidden sm:inline">Abbrechen</span>
              <span className="sm:hidden">Stop</span>
            </Button>
          )}
          <Button size="sm" onClick={() => refresh()} disabled={loading} className="w-full shrink-0 sm:w-auto">
            {loading ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      {/* Loading Progress */}
      {showInitialLoading && <ScannerProgress progress={scanProgress} />}

      {/* Filter Badges */}
      {hasAnyStocks && (
        <ScannerFilterBadges
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalCount={streamedStocks.length}
          epCount={scannerBuckets.ep.length}
          momentum1mCount={scannerBuckets["1m"].length}
          momentum3mCount={scannerBuckets["3m"].length}
          momentum6mCount={scannerBuckets["6m"].length}
          momentum1yCount={scannerBuckets["1y"].length}
          setupCount={scannerBuckets.setup.length}
          stockbeeCount={scannerBuckets.stockbee.length}
          rsCount={scannerBuckets.rs.length}
          minerviniCount={scannerBuckets.minervini.length}
          canslimCount={scannerBuckets.canslim.length}
          chrisSwingsCount={scannerBuckets.chrisswings.length}
          squeezeCount={scannerBuckets.squeeze.length}
          catalystCount={scannerBuckets.catalyst.length}
        />
      )}

      {hasAnyStocks && (
        <ScannerInsights
          compact
          stocks={streamedStocks}
          onSearch={(query) => setSearchQuery(query)}
        />
      )}

      <ScannerSignals compact onSearch={(query) => setSearchQuery(query)} cacheOnly={loading} />

      {/* Non-blocking refresh indicator */}
      {loading && hasAnyStocks && (
        <Card>
          <CardContent className="py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{scanProgress.message || "Aktualisiere Scanner-Daten im Hintergrund..."}</span>
          </CardContent>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="flex items-center gap-2 py-4">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-500">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {streamedStocks.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div>
                <CardTitle>
                  Scanner Ergebnisse{" "}
                  {loading && <span className="text-sm font-normal text-muted-foreground">(wird geladen...)</span>}
                </CardTitle>
                <CardDescription>
                  {displayData.length} Aktien gefunden - {visibleData.length} sichtbar - {streamedStocks.length} geladen
                  {scanStats && ` (${scanStats.fromCache} aus Cache)`}
                </CardDescription>
              </div>
              <ScannerToolbar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                compareMode={compareMode}
                setCompareMode={setCompareMode}
                selectedCount={selectedForCompare.size}
                onShowCompare={() => setShowCompareView(true)}
                displayCount={displayData.length}
                viewMode={viewMode}
                setViewMode={setViewMode}
                cardsPerRow={cardsPerRow}
                setCardsPerRow={setCardsPerRow}
                isMobileViewport={isMobileViewport}
                copiedList={copiedList}
                setCopiedList={setCopiedList}
                streamedStocks={streamedStocks}
                displayData={displayData}
                epCount={scannerBuckets.ep.length}
                momentum1mCount={scannerBuckets["1m"].length}
                momentum3mCount={scannerBuckets["3m"].length}
                momentum6mCount={scannerBuckets["6m"].length}
                momentum1yCount={scannerBuckets["1y"].length}
                setupCount={scannerBuckets.setup.length}
                stockbeeCount={scannerBuckets.stockbee.length}
                rsCount={scannerBuckets.rs.length}
                minerviniCount={scannerBuckets.minervini.length}
                canslimCount={scannerBuckets.canslim.length}
                catalystCount={scannerBuckets.catalyst.length}
                clearSelection={() => setSelectedForCompare(new Set())}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {viewMode === "table" && (
                <StockTable
                  stocks={visibleData}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  showEpColumns={activeTab === "ep"}
                  compareMode={compareMode}
                  selectedForCompare={selectedForCompare}
                  onSelectChange={handleSelectForCompare}
                  onSelectAll={handleSelectVisible}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
              )}
              {viewMode === "cards" && (
                <StockCardGrid
                  stocks={visibleData}
                  cardsPerRow={cardsPerRow}
                  onCardClick={toggleRow}
                />
              )}
              {viewMode === "watchlist" && (
                <CompactStockWatchlist
                  title="Scanner-Watchlist"
                  description="Alle Kerninfos kompakt in einer Zeile je Aktie."
                  items={visibleData.map(scannerStockToWatchItem)}
                  onSelect={toggleRow}
                  selectedSymbol={[...expandedRows][0] ?? null}
                  maxHeightClassName="max-h-[62dvh]"
                />
              )}
            </Tabs>
            {hasMoreResults && (
              <div className="mt-3 flex items-center justify-center border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((count) => Math.min(count + visibleStep, displayData.length))}
                >
                  Weitere laden ({visibleData.length}/{displayData.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compare View Dialog */}
      <CompareView
        open={showCompareView}
        onOpenChange={setShowCompareView}
        stocks={displayData.filter((s) => selectedForCompare.has(s.symbol))}
        onRemove={(symbol) => {
          setSelectedForCompare((prev) => {
            const next = new Set(prev);
            next.delete(symbol);
            return next;
          });
        }}
      />
    </div>
  );
}
