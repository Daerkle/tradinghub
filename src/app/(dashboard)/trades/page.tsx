"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { TradeService, TradeData } from "@/lib/models";

type SortField = "date" | "symbol" | "pnl" | "side";
type SortDirection = "asc" | "desc";

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [filteredTrades, setFilteredTrades] = useState<TradeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [resultFilter, setResultFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const tradesPerPage = 20;

  useEffect(() => {
    loadTrades();
  }, []);

  useEffect(() => {
    filterAndSortTrades();
  }, [trades, searchQuery, sideFilter, resultFilter, sortField, sortDirection]);

  async function loadTrades() {
    try {
      setIsLoading(true);
      const data = await TradeService.getAll();
      setTrades(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load trades:", err);
      setError("Trades konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  function filterAndSortTrades() {
    let filtered = [...trades];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (trade) =>
          trade.symbol.toLowerCase().includes(query) ||
          trade.setup?.toLowerCase().includes(query) ||
          trade.notes?.toLowerCase().includes(query)
      );
    }

    // Side filter
    if (sideFilter !== "all") {
      filtered = filtered.filter((trade) => trade.side === sideFilter);
    }

    // Result filter
    if (resultFilter !== "all") {
      if (resultFilter === "win") {
        filtered = filtered.filter((trade) => trade.pnl > 0);
      } else if (resultFilter === "loss") {
        filtered = filtered.filter((trade) => trade.pnl < 0);
      } else if (resultFilter === "breakeven") {
        filtered = filtered.filter((trade) => trade.pnl === 0);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "date":
          comparison = new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime();
          break;
        case "symbol":
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case "pnl":
          comparison = a.pnl - b.pnl;
          break;
        case "side":
          comparison = a.side.localeCompare(b.side);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    setFilteredTrades(filtered);
    setCurrentPage(1);
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await TradeService.delete(id);
      setTrades(trades.filter((t) => t.id !== id));
      toast.success("Trade gelöscht");
    } catch (err) {
      console.error("Failed to delete trade:", err);
      toast.error("Trade konnte nicht gelöscht werden");
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (entryTime: Date, exitTime: Date) => {
    const diff = new Date(exitTime).getTime() - new Date(entryTime).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Pagination
  const totalPages = Math.ceil(filteredTrades.length / tradesPerPage);
  const startIndex = (currentPage - 1) * tradesPerPage;
  const paginatedTrades = filteredTrades.slice(startIndex, startIndex + tradesPerPage);

  // Stats
  const totalPnL = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
  const winningTrades = filteredTrades.filter((t) => t.pnl > 0);
  const winRate = filteredTrades.length > 0 ? (winningTrades.length / filteredTrades.length) * 100 : 0;
  const avgPnl = filteredTrades.length > 0 ? totalPnL / filteredTrades.length : 0;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trades</h1>
          <p className="text-muted-foreground">Alle deine Trading-Aktivitäten</p>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trades</h1>
          <p className="text-muted-foreground">Alle deine Trading-Aktivitäten</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt P&L</CardTitle>
            {totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className={`text-2xl font-bold ${totalPnL >= 0 ? "text-green-500" : "text-red-500"}`}>
                {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{filteredTrades.length}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trefferquote</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{winRate.toFixed(1)}%</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ø P&L</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={`text-2xl font-bold ${avgPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {avgPnl >= 0 ? "+" : ""}${avgPnl.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Symbol, Setup oder Notizen suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={sideFilter} onValueChange={setSideFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Seite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Seiten</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="short">Short</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Ergebnis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="win">Gewinner</SelectItem>
                <SelectItem value="loss">Verlierer</SelectItem>
                <SelectItem value="breakeven">Breakeven</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Trades Table */}
      <Card>
        <CardHeader>
          <CardTitle>Trade-Liste</CardTitle>
          <CardDescription>
            {filteredTrades.length} Trades gefunden
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine Trades gefunden
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("date")}
                      >
                        <div className="flex items-center gap-1">
                          Datum
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("symbol")}
                      >
                        <div className="flex items-center gap-1">
                          Symbol
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("side")}
                      >
                        <div className="flex items-center gap-1">
                          Seite
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead>Einstieg</TableHead>
                      <TableHead>Ausstieg</TableHead>
                      <TableHead>Dauer</TableHead>
                      <TableHead>Setup</TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("pnl")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          P&L
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="w-[100px]">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTrades.map((trade) => (
                      <TableRow key={trade.id} className="group">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{formatDate(trade.exitTime)}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(trade.entryTime)} - {formatTime(trade.exitTime)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{trade.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={trade.side === "long" ? "default" : "secondary"}>
                            {trade.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>${trade.entryPrice.toFixed(2)}</TableCell>
                        <TableCell>${trade.exitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDuration(trade.entryTime, trade.exitTime)}
                        </TableCell>
                        <TableCell>
                          {trade.setup ? (
                            <Badge variant="outline">{trade.setup}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={`/trades/${trade.id}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Trade löschen?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Dieser Trade wird unwiderruflich gelöscht. Diese Aktion kann nicht
                                    rückgängig gemacht werden.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(trade.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Zeige {startIndex + 1}-{Math.min(startIndex + tradesPerPage, filteredTrades.length)} von {filteredTrades.length} Trades
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Seite {currentPage} von {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
