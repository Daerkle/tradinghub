"use client";

import { useState, useEffect } from "react";
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
import { CompareView } from "@/components/scanner/compare-view";
import { filterByScanType } from "@/lib/scanner-filters";
import type { StockData } from "@/types/scanner";

type SortField = keyof StockData | "none";
type SortDirection = "asc" | "desc";

export default function ScannerPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("catalystScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [copiedList, setCopiedList] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showCompareView, setShowCompareView] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [cardsPerRow, setCardsPerRow] = useState(4);

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
    batchSize: 10,
    onComplete: (stats) => {
      setLastUpdated(new Date().toLocaleTimeString("de-DE"));
      console.log(`Scan complete: ${stats.totalStocks} stocks (${stats.fromCache} from cache)`);
    },
    onError: (errorMsg) => {
      setError(errorMsg);
    },
  });

  useEffect(() => {
    startScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRow = (symbol: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortData = (data: StockData[]): StockData[] => {
    if (sortField === "none") return data;
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
  };

  const filterData = (data: StockData[]): StockData[] => {
    if (!searchQuery) return data;
    const query = searchQuery.toLowerCase();
    return data.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query) ||
        stock.sector?.toLowerCase().includes(query) ||
        stock.industry?.toLowerCase().includes(query)
    );
  };

  const getTabData = (): StockData[] => {
    if (!streamedStocks || streamedStocks.length === 0) return [];
    switch (activeTab) {
      case "ep": return filterByScanType(streamedStocks, "ep");
      case "1m": return filterByScanType(streamedStocks, "1m");
      case "3m": return filterByScanType(streamedStocks, "3m");
      case "6m": return filterByScanType(streamedStocks, "6m");
      case "setup": return filterByScanType(streamedStocks, "qullamaggie");
      case "stockbee": return filterByScanType(streamedStocks, "stockbee");
      case "rs": return filterByScanType(streamedStocks, "rs");
      case "minervini": return filterByScanType(streamedStocks, "minervini");
      case "canslim": return filterByScanType(streamedStocks, "canslim");
      case "chrisswings": return filterByScanType(streamedStocks, "chrisswings");
      case "squeeze": return filterByScanType(streamedStocks, "squeeze");
      case "catalyst": return filterByScanType(streamedStocks, "catalyst");
      default: return streamedStocks;
    }
  };

  const displayData = sortData(filterData(getTabData()));
  const hasAnyStocks = streamedStocks.length > 0;
  const showInitialLoading = loading && !hasAnyStocks;

  const epCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "ep").length : 0;
  const momentum1mCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "1m").length : 0;
  const momentum3mCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "3m").length : 0;
  const momentum6mCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "6m").length : 0;
  const setupCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "qullamaggie").length : 0;
  const stockbeeCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "stockbee").length : 0;
  const rsCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "rs").length : 0;
  const minerviniCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "minervini").length : 0;
  const canslimCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "canslim").length : 0;
  const chrisSwingsCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "chrisswings").length : 0;
  const squeezeCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "squeeze").length : 0;
  const catalystCount = streamedStocks.length > 0 ? filterByScanType(streamedStocks, "catalyst").length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Scanner</h1>
          <p className="text-muted-foreground mt-1">
            Momentum Leader, Swing-Setups und Breakout-Muster
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground sm:text-right">
              Zuletzt aktualisiert: {lastUpdated}
              {scanStats && scanStats.fromCache > 0 && ` (${scanStats.fromCache} aus Cache)`}
            </span>
          )}
          {loading && (
            <Button variant="outline" size="sm" onClick={cancelScan}>
              <span className="hidden sm:inline">Abbrechen</span>
              <span className="sm:hidden">Stop</span>
            </Button>
          )}
          <Button size="sm" onClick={() => refresh()} disabled={loading} className="shrink-0">
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
          epCount={epCount}
          momentum1mCount={momentum1mCount}
          momentum3mCount={momentum3mCount}
          momentum6mCount={momentum6mCount}
          setupCount={setupCount}
          stockbeeCount={stockbeeCount}
          rsCount={rsCount}
          minerviniCount={minerviniCount}
          canslimCount={canslimCount}
          chrisSwingsCount={chrisSwingsCount}
          squeezeCount={squeezeCount}
          catalystCount={catalystCount}
        />
      )}

      {hasAnyStocks && (
        <ScannerInsights
          stocks={streamedStocks}
          onSearch={(query) => setSearchQuery(query)}
        />
      )}

      <ScannerSignals onSearch={(query) => setSearchQuery(query)} />

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
                  {displayData.length} Aktien gefunden - {streamedStocks.length} geladen
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
                copiedList={copiedList}
                setCopiedList={setCopiedList}
                streamedStocks={streamedStocks}
                displayData={displayData}
                epCount={epCount}
                momentum1mCount={momentum1mCount}
                momentum3mCount={momentum3mCount}
                momentum6mCount={momentum6mCount}
                setupCount={setupCount}
                stockbeeCount={stockbeeCount}
                rsCount={rsCount}
                minerviniCount={minerviniCount}
                canslimCount={canslimCount}
                catalystCount={catalystCount}
                clearSelection={() => setSelectedForCompare(new Set())}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {viewMode === "table" && (
                <StockTable
                  stocks={displayData}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  showEpColumns={activeTab === "ep"}
                  compareMode={compareMode}
                  selectedForCompare={selectedForCompare}
                  onSelectChange={(symbol, selected) => {
                    setSelectedForCompare((prev) => {
                      const next = new Set(prev);
                      if (selected) next.add(symbol);
                      else next.delete(symbol);
                      return next;
                    });
                  }}
                  onSelectAll={(selected) => {
                    if (selected) {
                      setSelectedForCompare(new Set(displayData.map((s) => s.symbol)));
                    } else {
                      setSelectedForCompare(new Set());
                    }
                  }}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
              )}
              {viewMode === "cards" && (
                <StockCardGrid
                  stocks={displayData}
                  cardsPerRow={cardsPerRow}
                  onCardClick={toggleRow}
                />
              )}
            </Tabs>
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
