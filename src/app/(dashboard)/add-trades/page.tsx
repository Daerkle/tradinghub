"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TradeService } from "@/lib/models";
import {
  buildTradeIdentityKey,
  buildTradeImportHash,
  parseTradesFromText,
  splitIntoImportBatches,
  type ImportableTrade,
  type TradePreview,
} from "@/lib/trade-import";

const brokers = [
  { value: "interactiveBrokers", label: "Interactive Brokers", assetTypes: ["Stocks", "Options", "Futures"] },
  { value: "tradeStation", label: "TradeStation", assetTypes: ["Stocks", "Options", "Futures"] },
  { value: "td", label: "TD Ameritrade", assetTypes: ["Stocks", "Options"] },
  { value: "tradovate", label: "Tradovate", assetTypes: ["Futures"] },
  { value: "ninjatrader", label: "NinjaTrader", assetTypes: ["Futures"] },
  { value: "metatrader", label: "MetaTrader", assetTypes: ["Forex", "CFDs"] },
  { value: "csv", label: "Custom CSV", assetTypes: ["All"] },
];

function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }

  // UTF-16 LE BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2));
  }

  // UTF-16 BE BOM (swap to LE)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let i = 2, j = 0; i + 1 < bytes.length; i += 2, j += 2) {
      swapped[j] = bytes[i + 1];
      swapped[j + 1] = bytes[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }

  // Heuristic: if there are many zero bytes early, assume UTF-16LE
  const sample = bytes.slice(0, 100);
  const zeroCount = sample.reduce((count, b) => (b === 0 ? count + 1 : count), 0);
  if (sample.length > 0 && zeroCount / sample.length > 0.2) {
    return new TextDecoder("utf-16le").decode(bytes);
  }

  return new TextDecoder("utf-8").decode(bytes);
}

export default function AddTradesPage() {
  const router = useRouter();
  const [selectedBroker, setSelectedBroker] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [addMfePrices, setAddMfePrices] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [trades, setTrades] = useState<TradePreview[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // Re-parse if the broker changes after upload
  useEffect(() => {
    if (!fileText) return;
    const parsed = parseTradesFromText(fileText, selectedBroker || undefined);
    setTrades(parsed.trades);
    setParseWarnings(parsed.warnings);
  }, [fileText, selectedBroker]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setIsParsing(true);

      try {
        const buffer = await selectedFile.arrayBuffer();
        const text = decodeTextFile(buffer);
        setFileText(text);

        const parsed = parseTradesFromText(text, selectedBroker || undefined);
        setTrades(parsed.trades);
        setParseWarnings(parsed.warnings);

        if (!selectedBroker) {
          if (parsed.detectedFormat === "interactiveBrokers") {
            setSelectedBroker("interactiveBrokers");
          } else {
            setSelectedBroker("csv");
          }
        }

        if (parsed.warnings.length > 0) {
          console.warn("Trade import warnings:", parsed.warnings);
          toast(`Hinweis: ${parsed.warnings[0]}`);
        }

        if (parsed.trades.length === 0) {
          toast.error("Keine gültigen Trades in der Datei gefunden");
        } else {
          const validCount = parsed.trades.filter((t) => t.isValid).length;
          toast.success(`${validCount} gültige Trades von ${parsed.trades.length} gefunden`);
        }
      } catch (err) {
        console.error("Failed to parse file:", err);
        toast.error("Datei konnte nicht analysiert werden");
        setTrades([]);
        setParseWarnings([]);
        setFileText(null);
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Bitte lade eine Datei hoch");
      return;
    }

    const validTrades = trades.filter((t) => t.isValid);
    if (validTrades.length === 0) {
      toast.error("Keine gültigen Trades zum Importieren");
      return;
    }

    setIsLoading(true);
    let imported = 0;
    try {
      // Remove isValid flag before saving
      const importSource = selectedBroker || "auto";
      const rawTradesToSave: ImportableTrade[] = validTrades.map(({ isValid, ...trade }) => {
        const normalized: ImportableTrade = {
          ...trade,
          importSource,
        };
        normalized.importHash = normalized.importHash || buildTradeImportHash(normalized, importSource);
        return normalized;
      });

      // De-duplicate trades inside the uploaded file itself.
      const seenIdentityKeys = new Set<string>();
      let duplicateRowsInFile = 0;
      const tradesToSave: ImportableTrade[] = [];
      for (const trade of rawTradesToSave) {
        const identityKey = buildTradeIdentityKey(trade);
        if (seenIdentityKeys.has(identityKey)) {
          duplicateRowsInFile++;
          continue;
        }
        seenIdentityKeys.add(identityKey);
        tradesToSave.push(trade);
      }

      // Skip duplicates that were already imported before
      const existingHashes = await TradeService.findExistingImportHashes(
        tradesToSave
          .map((trade) => trade.importHash)
          .filter((hash): hash is string => typeof hash === "string" && hash.length > 0)
      );
      const notImportedByHash = tradesToSave.filter((trade) => {
        if (!trade.importHash) return true;
        return !existingHashes.has(trade.importHash);
      });

      // Fallback duplicate-check against existing trade records (works even if older rows have no importHash).
      const existingIdentityKeys = await TradeService.findExistingTradeIdentityKeys(notImportedByHash);
      const newTradesToSave = notImportedByHash.filter((trade) => {
        const identityKey = buildTradeIdentityKey(trade);
        return !existingIdentityKeys.has(identityKey);
      });

      const skippedByHash = tradesToSave.length - notImportedByHash.length;
      const skippedByIdentity = notImportedByHash.length - newTradesToSave.length;
      const skippedAsAlreadyExisting = skippedByHash + skippedByIdentity;

      if (newTradesToSave.length === 0) {
        toast("Keine neuen Trades gefunden (alles bereits vorhanden)");
        return;
      }

      // Parse Server batches are typically limited; chunk to keep imports reliable
      const batches = splitIntoImportBatches(newTradesToSave, 50);

      for (const batch of batches) {
        await TradeService.createBatch(batch);
        imported += batch.length;
      }

      toast.success(`${imported} Trades erfolgreich importiert!`);
      if (duplicateRowsInFile > 0) {
        toast(`${duplicateRowsInFile} doppelte Zeilen in der Datei übersprungen`);
      }
      if (skippedAsAlreadyExisting > 0) {
        toast(`${skippedAsAlreadyExisting} bereits vorhandene Trades übersprungen`);
      }
      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to import trades:", err);
      toast.error(
        imported > 0
          ? `Import abgebrochen: ${imported} Trades importiert, dann Fehler.`
          : "Trades konnten nicht importiert werden"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selectedBrokerInfo = brokers.find((b) => b.value === selectedBroker);
  const validTradesCount = trades.filter((t) => t.isValid).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trades hinzufügen</h1>
        <p className="text-muted-foreground">
          Importiere deine Trades von deinem Broker
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
        {/* Broker Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Broker auswählen</CardTitle>
            <CardDescription>
              Wähle deinen Broker oder deine Trading-Plattform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedBroker} onValueChange={setSelectedBroker}>
              <SelectTrigger>
                <SelectValue placeholder="Broker auswählen" />
              </SelectTrigger>
              <SelectContent>
                {brokers.map((broker) => (
                  <SelectItem key={broker.value} value={broker.value}>
                    {broker.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedBrokerInfo && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">Unterstützt:</span>
                {selectedBrokerInfo.assetTypes.map((type) => (
                  <Badge key={type} variant="secondary">
                    {type}
                  </Badge>
                ))}
              </div>
            )}
            {!selectedBrokerInfo && file && (
              <p className="text-xs text-muted-foreground">
                Broker wird automatisch aus der Datei erkannt.
              </p>
            )}
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Datei hochladen</CardTitle>
            <CardDescription>
              Lade deine Trade-Historie-Exportdatei hoch (CSV)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="file">Trade-Datei</Label>
              <div className="flex gap-2">
                <Input
                  id="file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                  disabled={isParsing}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Custom CSV: symbol, side, entryPrice, exitPrice, entryTime, exitTime, quantity, pnl (optional: commission). IBKR: Trades-Export (Date/Time, Symbol, Quantity, T. Price, Comm/Fee, Buy/Sell).
              </p>
            </div>

            {file && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm flex-1 truncate">{file.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setFile(null);
                    setTrades([]);
                    setParseWarnings([]);
                    setFileText(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="mfe"
                checked={addMfePrices}
                onCheckedChange={setAddMfePrices}
              />
              <Label htmlFor="mfe" className="text-sm">
                MFE/MAE-Preise automatisch hinzufügen
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade Preview */}
      {trades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Trade-Vorschau</CardTitle>
            <CardDescription>
              {validTradesCount} von {trades.length} Trades sind gültig und werden importiert
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Seite</TableHead>
                  <TableHead className="hidden sm:table-cell">Menge</TableHead>
                  <TableHead>Einstieg</TableHead>
                  <TableHead>Ausstieg</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.slice(0, 20).map((trade, i) => (
                  <TableRow key={i} className={!trade.isValid ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{trade.symbol || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={trade.side === "long" ? "default" : "secondary"}
                      >
                        {trade.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{trade.quantity}</TableCell>
                    <TableCell>${trade.entryPrice.toFixed(2)}</TableCell>
                    <TableCell>${trade.exitPrice.toFixed(2)}</TableCell>
                    <TableCell
                      className={
                        trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                      }
                    >
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={trade.isValid ? "default" : "destructive"}>
                        {trade.isValid ? "Gültig" : "Ungültig"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            {trades.length > 20 && (
              <p className="text-sm text-muted-foreground mt-4">
                Zeige erste 20 von {trades.length} Trades
              </p>
            )}
            {(selectedBroker === "interactiveBrokers" || (!selectedBroker && file)) && (
              <p className="text-sm text-muted-foreground mt-2">
                IBKR-Dateien enthalten einzelne Ausführungen (Fills). Mehrere Fills derselben Position werden zu einem geschlossenen Trade zusammengefasst.
              </p>
            )}
            {parseWarnings.length > 0 && (
              <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
                <p className="text-sm font-medium">Import-Hinweise</p>
                <div className="mt-2 space-y-1">
                  {parseWarnings.map((warning, index) => (
                    <p key={`${warning}-${index}`} className="text-xs text-muted-foreground">
                      - {warning}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!file || isLoading || validTradesCount === 0}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Upload className="mr-2 h-4 w-4" />
          {validTradesCount > 0 ? `${validTradesCount} ` : ""}Trades importieren
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            setFile(null);
            setTrades([]);
            setParseWarnings([]);
            setSelectedBroker("");
            setFileText(null);
          }}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
