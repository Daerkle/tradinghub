"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Flag,
  Target,
  ChevronLeft,
  ChevronRight,
  Trophy,
  XCircle,
  Clock,
} from "lucide-react";

interface Setup {
  id: string;
  symbol: string;
  setupType: string;
  setupDate: string;
  catalystType: string | null;
  gapPercent: string | null;
  volumeRatio: string | null;
  epsSurprisePercent: string | null;
  outcome: string | null;
  maxGainPercent: string | null;
  stoppedOut: boolean | null;
  consolidationDays: number | null;
  priorRunPercent: string | null;
  notes: string | null;
  tags: string[] | null;
  createdAt: string;
}

interface Stats {
  total: number;
  winners: number;
  losers: number;
  pending: number;
  winRate: string;
  avgGain: string;
}

const SETUP_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  EP: { label: "Episodic Pivot", icon: <Zap className="h-4 w-4" />, color: "bg-yellow-500" },
  PowerEarningsGap: { label: "Power Earnings Gap", icon: <TrendingUp className="h-4 w-4" />, color: "bg-green-500" },
  Flag: { label: "Flag", icon: <Flag className="h-4 w-4" />, color: "bg-blue-500" },
  HighTightFlag: { label: "High Tight Flag", icon: <Target className="h-4 w-4" />, color: "bg-purple-500" },
};

export default function DatabasePage() {
  const router = useRouter();
  const [setups, setSetups] = useState<Setup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("");

  const fetchSetups = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "20");
      if (typeFilter) params.set("type", typeFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);
      if (search) params.set("search", search);

      const response = await fetch(`/api/database/setups?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setSetups(data.setups);
        setStats(data.stats);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error("Error fetching setups:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetups();
  }, [page, typeFilter, outcomeFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSetups();
  };

  const getOutcomeBadge = (outcome: string | null, stoppedOut: boolean | null) => {
    if (outcome === "winner") {
      return <Badge className="bg-green-500"><Trophy className="h-3 w-3 mr-1" />Winner</Badge>;
    }
    if (outcome === "loser") {
      return (
        <Badge variant="destructive">
          {stoppedOut ? <XCircle className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
          {stoppedOut ? "Stopped Out" : "Loser"}
        </Badge>
      );
    }
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  const formatPercent = (value: string | null) => {
    if (!value) return "-";
    const num = parseFloat(value);
    const formatted = num.toFixed(1) + "%";
    if (num > 0) return <span className="text-green-500">+{formatted}</span>;
    if (num < 0) return <span className="text-red-500">{formatted}</span>;
    return formatted;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Setup Datenbank</h1>
          <p className="text-muted-foreground">
            Qullamaggie Setups - Winners und Losers zum Lernen
          </p>
        </div>
        <Button variant="outline" onClick={fetchSetups}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gesamt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Trophy className="h-4 w-4 text-green-500" />Winners
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats.winners}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <XCircle className="h-4 w-4 text-red-500" />Losers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{stats.losers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.winRate}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Gain</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">+{stats.avgGain}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Symbol suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </form>

            <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Setup Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="EP">Episodic Pivot</SelectItem>
                <SelectItem value="PowerEarningsGap">Power Earnings Gap</SelectItem>
                <SelectItem value="Flag">Flag</SelectItem>
                <SelectItem value="HighTightFlag">High Tight Flag</SelectItem>
              </SelectContent>
            </Select>

            <Select value={outcomeFilter || "all"} onValueChange={(v) => setOutcomeFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="winner">Winners</SelectItem>
                <SelectItem value="loser">Losers</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : setups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">Keine Setups gefunden</p>
              <p className="text-sm">Starte den Backfill um Daten zu laden</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Catalyst</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead className="text-right">Vol Ratio</TableHead>
                  <TableHead className="text-right">EPS Surprise</TableHead>
                  <TableHead className="text-right">Max Gain</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setups.map((setup) => {
                  const typeInfo = SETUP_TYPE_LABELS[setup.setupType] || {
                    label: setup.setupType,
                    icon: <Database className="h-4 w-4" />,
                    color: "bg-gray-500",
                  };

                  return (
                    <TableRow
                      key={setup.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/database/${setup.id}`)}
                    >
                      <TableCell className="font-medium">{setup.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <span className={`w-2 h-2 rounded-full ${typeInfo.color}`} />
                          {typeInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(setup.setupDate).toLocaleDateString("de-DE")}</TableCell>
                      <TableCell>
                        {setup.catalystType && (
                          <Badge variant="secondary" className="capitalize">
                            {setup.catalystType}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatPercent(setup.gapPercent)}</TableCell>
                      <TableCell className="text-right">
                        {setup.volumeRatio ? `${parseFloat(setup.volumeRatio).toFixed(1)}x` : "-"}
                      </TableCell>
                      <TableCell className="text-right">{formatPercent(setup.epsSurprisePercent)}</TableCell>
                      <TableCell className="text-right">{formatPercent(setup.maxGainPercent)}</TableCell>
                      <TableCell>{getOutcomeBadge(setup.outcome, setup.stoppedOut)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Seite {page} von {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
