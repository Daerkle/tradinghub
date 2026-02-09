"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  AlertTriangle,
  Edit,
  Trash2,
  Star,
  Calendar,
  DollarSign,
  Percent,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
  Save,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";
import { toast } from "sonner";
import { TradeService, TradeData } from "@/lib/models";

const setupOptions = [
  "Breakout",
  "Pullback",
  "Reversal",
  "Scalp",
  "Swing",
  "Gap Fill",
  "Trend Following",
  "Mean Reversion",
  "News Play",
  "Momentum",
];

export default function TradeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tradeId = params.id as string;

  const [trade, setTrade] = useState<TradeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [editedSetup, setEditedSetup] = useState("");
  const [rating, setRating] = useState(0);

  useEffect(() => {
    loadTrade();
  }, [tradeId]);

  async function loadTrade() {
    try {
      setIsLoading(true);
      const data = await TradeService.getById(tradeId);
      if (data) {
        setTrade(data);
        setEditedNotes(data.notes || "");
        setEditedSetup(data.setup || "");
      }
    } catch (err) {
      console.error("Failed to load trade:", err);
      toast.error("Trade konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }

  const handleSave = async () => {
    if (!trade) return;
    setIsSaving(true);
    try {
      await TradeService.update(tradeId, {
        notes: editedNotes,
        setup: editedSetup,
      });
      setTrade({ ...trade, notes: editedNotes, setup: editedSetup });
      setIsEditing(false);
      toast.success("Trade aktualisiert");
    } catch (err) {
      console.error("Failed to update trade:", err);
      toast.error("Trade konnte nicht aktualisiert werden");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await TradeService.delete(tradeId);
      toast.success("Trade gelöscht");
      router.push("/trades");
    } catch (err) {
      console.error("Failed to delete trade:", err);
      toast.error("Trade konnte nicht gelöscht werden");
    }
  };

  // Generate mock price data for chart visualization
  const generatePriceChart = () => {
    if (!trade) return [];

    const entryPrice = trade.entryPrice;
    const exitPrice = trade.exitPrice;
    const isLong = trade.side === "long";
    const entryTime = new Date(trade.entryTime).getTime();
    const exitTime = new Date(trade.exitTime).getTime();
    const duration = exitTime - entryTime;
    const points = 30;

    const data = [];
    const priceRange = Math.abs(exitPrice - entryPrice);
    const volatility = priceRange * 0.3;

    // Calculate MFE and MAE levels
    const mfePrice = isLong
      ? entryPrice + (trade.mfe || priceRange * 1.2)
      : entryPrice - (trade.mfe || priceRange * 1.2);
    const maePrice = isLong
      ? entryPrice - (trade.mae || priceRange * 0.5)
      : entryPrice + (trade.mae || priceRange * 0.5);

    for (let i = 0; i <= points; i++) {
      const progress = i / points;
      const time = new Date(entryTime + duration * progress);

      // Generate realistic price movement
      let basePrice;
      if (progress < 0.1) {
        basePrice = entryPrice;
      } else if (progress > 0.9) {
        basePrice = exitPrice;
      } else {
        // Smooth interpolation with some variance
        const trend = entryPrice + (exitPrice - entryPrice) * progress;
        const noise = (Math.random() - 0.5) * volatility * Math.sin(progress * Math.PI);
        basePrice = trend + noise;
      }

      // Add MFE/MAE touch points
      if (progress > 0.2 && progress < 0.4 && trade.mfe) {
        basePrice = Math.max(basePrice, isLong ? mfePrice * 0.98 : mfePrice * 1.02);
      }
      if (progress > 0.5 && progress < 0.6 && trade.mae) {
        basePrice = isLong
          ? Math.min(basePrice, maePrice * 1.02)
          : Math.max(basePrice, maePrice * 0.98);
      }

      data.push({
        time: time.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        timestamp: time.getTime(),
        price: Number(basePrice.toFixed(2)),
        isEntry: i === 0,
        isExit: i === points,
      });
    }

    return data;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (entryTime: Date, exitTime: Date) => {
    const diff = new Date(exitTime).getTime() - new Date(entryTime).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/trades">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Trade nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              Der angeforderte Trade konnte nicht gefunden werden.
            </p>
            <Link href="/trades">
              <Button className="mt-4">Zurück zur Übersicht</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const priceChange = trade.exitPrice - trade.entryPrice;
  const priceChangePercent = (priceChange / trade.entryPrice) * 100;
  const isWin = trade.pnl > 0;
  const chartData = generatePriceChart();

  // R-Multiple calculation (simplified - assuming risk = MAE or a portion of entry)
  const estimatedRisk = trade.mae || Math.abs(trade.pnl) * 0.5;
  const rMultiple = estimatedRisk > 0 ? trade.pnl / estimatedRisk : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/trades">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{trade.symbol}</h1>
              <Badge variant={trade.side === "long" ? "default" : "secondary"} className="text-sm">
                {trade.side.toUpperCase()}
              </Badge>
              <Badge variant={isWin ? "default" : "destructive"} className={isWin ? "bg-green-500" : ""}>
                {isWin ? "GEWINNER" : "VERLIERER"}
              </Badge>
            </div>
            <p className="text-muted-foreground">{formatDate(trade.exitTime)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                <X className="h-4 w-4 mr-2" />
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Speichern
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Trade löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dieser Trade wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig
                      gemacht werden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {/* P&L Hero Card */}
      <Card className={`border-2 ${isWin ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Profit / Loss</p>
              <p className={`text-4xl font-bold ${isWin ? "text-green-500" : "text-red-500"}`}>
                {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
              </p>
              {trade.commission > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  inkl. ${trade.commission.toFixed(2)} Kommission
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">R-Multiple</p>
                  <p className={`text-2xl font-bold ${rMultiple >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {rMultiple >= 0 ? "+" : ""}{rMultiple.toFixed(2)}R
                  </p>
                </div>
                <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center"
                  style={{ borderColor: isWin ? "rgb(34 197 94)" : "rgb(239 68 68)" }}>
                  {isWin ? (
                    <TrendingUp className="h-8 w-8 text-green-500" />
                  ) : (
                    <TrendingDown className="h-8 w-8 text-red-500" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Einstieg</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${trade.entryPrice.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{formatTime(trade.entryTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ausstieg</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${trade.exitPrice.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{formatTime(trade.exitTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Preisänderung</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${priceChange >= 0 ? "text-green-500" : "text-red-500"}`}>
              {priceChange >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Haltezeit</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(trade.entryTime, trade.exitTime)}
            </div>
            <p className="text-xs text-muted-foreground">
              {trade.quantity} Stück
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Price Chart with Entry/Exit */}
      <Card>
        <CardHeader>
          <CardTitle>Preisverlauf</CardTitle>
          <CardDescription>
            Visualisierung mit Entry und Exit Markierungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={isWin ? "rgb(34 197 94)" : "rgb(239 68 68)"}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={isWin ? "rgb(34 197 94)" : "rgb(239 68 68)"}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  domain={["dataMin - 0.5", "dataMax + 0.5"]}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Preis"]}
                />

                {/* Entry Line */}
                <ReferenceLine
                  y={trade.entryPrice}
                  stroke="rgb(59 130 246)"
                  strokeDasharray="5 5"
                  label={{
                    value: `Einstieg $${trade.entryPrice.toFixed(2)}`,
                    position: "right",
                    fill: "rgb(59 130 246)",
                    fontSize: 12,
                  }}
                />

                {/* Exit Line */}
                <ReferenceLine
                  y={trade.exitPrice}
                  stroke={isWin ? "rgb(34 197 94)" : "rgb(239 68 68)"}
                  strokeDasharray="5 5"
                  label={{
                    value: `Ausstieg $${trade.exitPrice.toFixed(2)}`,
                    position: "right",
                    fill: isWin ? "rgb(34 197 94)" : "rgb(239 68 68)",
                    fontSize: 12,
                  }}
                />

                {/* MFE Line */}
                {trade.mfe && (
                  <ReferenceLine
                    y={trade.side === "long"
                      ? trade.entryPrice + trade.mfe
                      : trade.entryPrice - trade.mfe}
                    stroke="rgb(168 85 247)"
                    strokeDasharray="3 3"
                    label={{
                      value: "MFE",
                      position: "left",
                      fill: "rgb(168 85 247)",
                      fontSize: 10,
                    }}
                  />
                )}

                {/* MAE Line */}
                {trade.mae && (
                  <ReferenceLine
                    y={trade.side === "long"
                      ? trade.entryPrice - trade.mae
                      : trade.entryPrice + trade.mae}
                    stroke="rgb(249 115 22)"
                    strokeDasharray="3 3"
                    label={{
                      value: "MAE",
                      position: "left",
                      fill: "rgb(249 115 22)",
                      fontSize: 10,
                    }}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={isWin ? "rgb(34 197 94)" : "rgb(239 68 68)"}
                  fillOpacity={1}
                  fill="url(#priceGradient)"
                  strokeWidth={2}
                />

                {/* Entry Point */}
                <ReferenceDot
                  x={chartData[0]?.time}
                  y={trade.entryPrice}
                  r={8}
                  fill="rgb(59 130 246)"
                  stroke="white"
                  strokeWidth={2}
                />

                {/* Exit Point */}
                <ReferenceDot
                  x={chartData[chartData.length - 1]?.time}
                  y={trade.exitPrice}
                  r={8}
                  fill={isWin ? "rgb(34 197 94)" : "rgb(239 68 68)"}
                  stroke="white"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chart Legend */}
          <div className="flex flex-wrap gap-4 mt-4 justify-center text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Einstieg</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isWin ? "bg-green-500" : "bg-red-500"}`} />
              <span>Ausstieg</span>
            </div>
            {trade.mfe && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span>MFE (Max Favorable)</span>
              </div>
            )}
            {trade.mae && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span>MAE (Max Adverse)</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* MFE/MAE Analysis */}
      {(trade.mfe || trade.mae) && (
        <Card>
          <CardHeader>
            <CardTitle>Trade-Effizienz</CardTitle>
            <CardDescription>
              Maximum Favorable / Adverse Excursion Analyse
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {trade.mfe && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4 text-purple-500" />
                      MFE (Max Favorable Excursion)
                    </span>
                    <span className="text-sm text-green-500">+${trade.mfe.toFixed(2)}</span>
                  </div>
                  <Progress
                    value={Math.min((trade.pnl / trade.mfe) * 100, 100)}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {((trade.pnl / trade.mfe) * 100).toFixed(1)}% des MFE realisiert
                  </p>
                </div>
              )}
              {trade.mae && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      MAE (Max Adverse Excursion)
                    </span>
                    <span className="text-sm text-red-500">-${trade.mae.toFixed(2)}</span>
                  </div>
                  <Progress
                    value={Math.min((trade.mae / Math.abs(trade.entryPrice * 0.1)) * 100, 100)}
                    className="h-2 [&>div]:bg-orange-500"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximaler Drawdown während des Trades
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trade Rating */}
      <Card>
        <CardHeader>
          <CardTitle>Bewertung & Notizen</CardTitle>
          <CardDescription>
            Bewerte und dokumentiere deinen Trade
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Star Rating */}
          <div className="space-y-2">
            <Label>Trade-Bewertung</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="focus:outline-none"
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Setup */}
          <div className="space-y-2">
            <Label>Setup / Strategie</Label>
            {isEditing ? (
              <Select value={editedSetup} onValueChange={setEditedSetup}>
                <SelectTrigger>
                  <SelectValue placeholder="Setup auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {setupOptions.map((setup) => (
                    <SelectItem key={setup} value={setup}>
                      {setup}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div>
                {trade.setup ? (
                  <Badge variant="outline" className="text-sm">
                    {trade.setup}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">Kein Setup angegeben</span>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notizen</Label>
            {isEditing ? (
              <Textarea
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                placeholder="Was hast du bei diesem Trade gelernt? Was lief gut, was könnte besser sein?"
                className="min-h-[150px]"
              />
            ) : (
              <div className="p-4 bg-muted/30 rounded-lg min-h-[100px]">
                {trade.notes ? (
                  <p className="whitespace-pre-wrap">{trade.notes}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Keine Notizen vorhanden. Klicke auf &quot;Bearbeiten&quot; um Notizen hinzuzufügen.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Screenshots */}
      {trade.screenshots && trade.screenshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Screenshots</CardTitle>
            <CardDescription>
              Chart-Bilder und Screenshots für diesen Trade
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {trade.screenshots.map((url, index) => (
                <div key={index} className="relative aspect-video rounded-lg overflow-hidden border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Screenshot ${index + 1}`}
                    className="object-cover w-full h-full"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
