"use client";

import { useState } from "react";
import {
  Loader2, CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { TradeService } from "@/lib/models";
import type { FlexQueryTrade } from "@/lib/ib-flex-query";
import { buildTradesFromIBExecutions, type IBExecution } from "@/lib/trade-import";

type SyncStatus = "idle" | "testing" | "syncing" | "success" | "error";

interface IBFlexQuerySyncProps {
  savedToken?: string;
  savedQueryId?: string;
  onCredentialsSave?: (token: string, queryId: string) => void;
}

const FLEX_REQUEST_TIMEOUT_MS = 70_000;

interface FlexApiResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

async function postFlexQuery(payload: Record<string, unknown>): Promise<FlexApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLEX_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/trades/flex-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data: FlexApiResponse = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as FlexApiResponse;
      } catch {
        data = { error: raw };
      }
    }

    if (!response.ok && !data.error) {
      data.error = `HTTP ${response.status}`;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function mapFlexTradesToExecutions(trades: FlexQueryTrade[]): IBExecution[] {
  return trades.reduce<IBExecution[]>((executions, trade) => {
      const symbol = (trade.symbol || trade.underlyingSymbol || "").trim().toUpperCase();
      const time = new Date(trade.dateTime);
      const isBuy = trade.buySell === "BUY" || trade.buySell === "BOT";
      const quantity = Math.abs(trade.quantity);
      const price = Number(trade.tradePrice);

      if (
        !symbol ||
        !Number.isFinite(time.getTime()) ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(price) ||
        price <= 0
      ) {
        return executions;
      }

      executions.push({
        symbol,
        underlyingSymbol: (trade.underlyingSymbol || "").trim().toUpperCase() || undefined,
        assetCategory: trade.assetCategory,
        currency: (trade.currency || "").trim().toUpperCase() || "USD",
        time,
        signedQuantity: isBuy ? quantity : -quantity,
        price,
        commission: Math.abs(trade.commission),
        multiplier: trade.multiplier > 0 ? trade.multiplier : trade.assetCategory === "OPT" ? 100 : 1,
        openCloseIndicator: trade.openCloseIndicator,
        code: trade.code,
        realizedPnl: trade.realizedPL,
        executionId: trade.executionId,
      } satisfies IBExecution);

      return executions;
    }, []);
}

export function IBFlexQuerySync({ savedToken, savedQueryId, onCredentialsSave }: IBFlexQuerySyncProps) {
  const [token, setToken] = useState(savedToken || "");
  const [queryId, setQueryId] = useState(savedQueryId || "");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trades, setTrades] = useState<FlexQueryTrade[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [accountInfo, setAccountInfo] = useState<{ accountId: string; fromDate: string; toDate: string } | null>(null);

  const handleTest = async () => {
    if (!token || !queryId) {
      toast.error("Bitte Token und Query ID eingeben");
      return;
    }

    setStatus("testing");
    setErrorMessage(null);

    try {
      const data = await postFlexQuery({ token, queryId, action: "test" });

      if (data.success) {
        setStatus("success");
        toast.success("Verbindung erfolgreich!");
        onCredentialsSave?.(token, queryId);
      } else {
        const errorText = typeof data.error === "string" ? data.error : "Verbindungstest fehlgeschlagen";
        setStatus("error");
        setErrorMessage(errorText);
        toast.error(errorText);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setStatus("error");
        setErrorMessage("Zeitüberschreitung beim Verbindungstest. Bitte erneut versuchen.");
        toast.error("Timeout beim Verbindungstest");
        return;
      }
      setStatus("error");
      setErrorMessage("Netzwerkfehler. Bitte prüfe deine Verbindung.");
      toast.error("Netzwerkfehler");
    }
  };

  const handleSync = async () => {
    if (!token || !queryId) {
      toast.error("Bitte Token und Query ID eingeben");
      return;
    }

    setStatus("syncing");
    setErrorMessage(null);
    setTrades([]);
    setImportWarnings([]);
    setImportedCount(0);

    try {
      const data = await postFlexQuery({ token, queryId });

      if (!data.success) {
        const errorText = typeof data.error === "string" ? data.error : "Sync fehlgeschlagen";
        setStatus("error");
        setErrorMessage(errorText);
        toast.error(errorText);
        return;
      }

      const flexTrades = Array.isArray(data.trades) ? (data.trades as FlexQueryTrade[]) : [];
      setTrades(flexTrades);
      setAccountInfo({
        accountId: typeof data.accountId === "string" ? data.accountId : "",
        fromDate: typeof data.fromDate === "string" ? data.fromDate : "",
        toDate: typeof data.toDate === "string" ? data.toDate : "",
      });

      if (flexTrades.length === 0) {
        setStatus("success");
        toast("Keine neuen Trades in der Flex Query gefunden");
        return;
      }

      const { trades: importable, warnings } = buildTradesFromIBExecutions(
        mapFlexTradesToExecutions(flexTrades),
        {
          source: "ib-flex",
          carryInMode: "infer-from-realized-pnl",
        }
      );
      setImportWarnings(warnings);
      if (warnings.length > 0) {
        toast(warnings[0]);
      }

      if (importable.length === 0) {
        setStatus("success");
        toast("Keine abgeschlossenen Trades gefunden (möglicherweise nur offene Positionen)");
        return;
      }

      // Skip already imported trades based on deterministic importHash
      const importHashes = importable
        .map((t) => t.importHash)
        .filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
      const existingHashes = await TradeService.findExistingImportHashes(importHashes);
      const newTrades = importable.filter((trade) => {
        if (!trade.importHash) return true;
        return !existingHashes.has(trade.importHash);
      });

      if (newTrades.length === 0) {
        setStatus("success");
        toast("Keine neuen Trades gefunden (alles bereits importiert)");
        return;
      }

      // Import in batches of 50
      let imported = 0;
      const batchSize = 50;
      for (let i = 0; i < newTrades.length; i += batchSize) {
        const batch = newTrades.slice(i, i + batchSize);
        await TradeService.createBatch(batch);
        imported += batch.length;
      }

      setImportedCount(imported);
      setStatus("success");
      onCredentialsSave?.(token, queryId);
      toast.success(`${imported} Trades erfolgreich importiert!`);
      if (importable.length > newTrades.length) {
        toast(`${importable.length - newTrades.length} doppelte Trades übersprungen`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setStatus("error");
        setErrorMessage("Zeitüberschreitung beim Trade-Sync. Bitte erneut versuchen.");
        toast.error("Timeout beim Trade-Sync");
        return;
      }
      setStatus("error");
      setErrorMessage("Netzwerkfehler beim Sync");
      toast.error("Netzwerkfehler beim Sync");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="ib-token">Flex Web Service Token</Label>
          <div className="relative">
            <Input
              id="ib-token"
              type={showToken ? "text" : "password"}
              placeholder="Dein Flex Query Token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ib-query-id">Flex Query ID</Label>
          <Input
            id="ib-query-id"
            placeholder="z.B. 123456"
            value={queryId}
            onChange={(e) => setQueryId(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Erstelle einen Flex Query Token und eine Activity Flex Query in deinem{" "}
          <a
            href="https://www.interactivebrokers.com/en/software/am/am/reports/activityflexqueries.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            IB Account Management <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!token || !queryId || status === "testing" || status === "syncing"}
        >
          {status === "testing" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : status === "success" && !trades.length ? (
            <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
          ) : null}
          Verbindung testen
        </Button>
        <Button
          onClick={handleSync}
          disabled={!token || !queryId || status === "testing" || status === "syncing"}
        >
          {status === "syncing" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : null}
          Trades synchronisieren
        </Button>
      </div>

      {/* Error */}
      {status === "error" && errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 text-red-500 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {importWarnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {importWarnings.slice(0, 4).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {importWarnings.length > 4 && (
            <p>{importWarnings.length - 4} weitere Hinweise ausgeblendet.</p>
          )}
        </div>
      )}

      {/* Success with account info */}
      {status === "success" && accountInfo && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-600 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>
            Konto: {accountInfo.accountId} | Zeitraum: {accountInfo.fromDate} - {accountInfo.toDate}
            {importedCount > 0 && ` | ${importedCount} Trades importiert`}
          </span>
        </div>
      )}

      {/* Trade Preview */}
      {trades.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{trades.length} Executions gefunden</span>
            {importedCount > 0 && (
              <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                {importedCount} importiert
              </Badge>
            )}
          </div>
          <div className="max-h-[300px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Seite</TableHead>
                  <TableHead>Menge</TableHead>
                  <TableHead>Preis</TableHead>
                  <TableHead>P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.slice(0, 50).map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{t.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {t.assetCategory === "STK" ? "Aktie" : t.assetCategory === "OPT" ? "Option" : t.assetCategory}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.buySell === "BUY" || t.buySell === "BOT" ? "default" : "secondary"}>
                        {t.buySell}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.quantity}</TableCell>
                    <TableCell>${t.tradePrice.toFixed(2)}</TableCell>
                    <TableCell className={t.realizedPL >= 0 ? "text-green-500" : "text-red-500"}>
                      {t.realizedPL !== 0 ? `${t.realizedPL >= 0 ? "+" : ""}$${t.realizedPL.toFixed(2)}` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {trades.length > 50 && (
            <p className="text-xs text-muted-foreground">
              Zeige erste 50 von {trades.length} Executions
            </p>
          )}
        </div>
      )}
    </div>
  );
}
