"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  Loader2,
  ArrowLeft,
  Trash2,
  Calendar,
  ImagePlus,
  Link as LinkIcon,
  X,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { DiaryService, DiaryData, TradeService, TradeData } from "@/lib/models";
import { RichTextEditor } from "@/components/rich-text-editor";

const moodOptions = [
  { value: "positive", label: "Positiv", color: "bg-green-500" },
  { value: "neutral", label: "Neutral", color: "bg-yellow-500" },
  { value: "negative", label: "Negativ", color: "bg-red-500" },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DiaryDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [entry, setEntry] = useState<DiaryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("");
  const [pnl, setPnl] = useState<number>(0);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [linkedTrades, setLinkedTrades] = useState<string[]>([]);
  const [availableTrades, setAvailableTrades] = useState<TradeData[]>([]);
  const [showTradeSelector, setShowTradeSelector] = useState(false);

  useEffect(() => {
    loadEntry();
    loadTrades();
  }, [id]);

  async function loadEntry() {
    try {
      setIsLoading(true);
      const data = await DiaryService.getById(id);
      if (data) {
        setEntry(data);
        setTitle(data.title);
        setContent(data.content);
        setMood(data.mood);
        setPnl(data.pnl || 0);
        setTags(data.tags || []);
        setImages(data.images || []);
        setLinkedTrades(data.linkedTrades || []);
      } else {
        setError("Eintrag nicht gefunden");
      }
    } catch (err) {
      console.error("Failed to load diary entry:", err);
      setError("Eintrag konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTrades() {
    try {
      const trades = await TradeService.getAll();
      setAvailableTrades(trades);
    } catch (err) {
      console.error("Failed to load trades:", err);
    }
  }

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleAddImage = () => {
    const url = prompt("Bild-URL eingeben:");
    if (url && url.trim()) {
      setImages([...images, url.trim()]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleToggleTrade = (tradeId: string) => {
    if (linkedTrades.includes(tradeId)) {
      setLinkedTrades(linkedTrades.filter((t) => t !== tradeId));
    } else {
      setLinkedTrades([...linkedTrades, tradeId]);
    }
  };

  const handleSave = async () => {
    if (!title || !content || !mood) {
      toast.error("Bitte fülle alle Pflichtfelder aus");
      return;
    }

    setIsSaving(true);
    try {
      await DiaryService.update(id, {
        title,
        content,
        mood: mood as "positive" | "neutral" | "negative",
        pnl,
        tags,
        images,
        linkedTrades,
      });
      toast.success("Änderungen gespeichert");
    } catch (err) {
      console.error("Failed to save diary entry:", err);
      toast.error("Änderungen konnten nicht gespeichert werden");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await DiaryService.delete(id);
      toast.success("Eintrag gelöscht");
      router.push("/diary");
    } catch (err) {
      console.error("Failed to delete diary entry:", err);
      toast.error("Eintrag konnte nicht gelöscht werden");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    // TODO: Implement actual file upload to Parse Server
    // For now, create a local object URL
    const url = URL.createObjectURL(file);
    setImages([...images, url]);
    return url;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/diary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fehler</h1>
            <p className="text-muted-foreground">{error || "Eintrag nicht gefunden"}</p>
          </div>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error || "Eintrag nicht gefunden"}</p>
            <Button asChild className="mt-4">
              <Link href="/diary">Zurück zur Übersicht</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/diary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Eintrag bearbeiten</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {entry.date
                ? new Date(entry.date).toLocaleDateString("de-DE", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Kein Datum"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Dieser Vorgang kann nicht rückgängig gemacht werden. Der Eintrag wird
                  dauerhaft gelöscht.
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
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Eintragsdetails</CardTitle>
              <CardDescription>
                Bearbeite deinen Trading-Tagebucheintrag
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    placeholder="z.B. Guter Trading-Tag"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mood">Stimmung *</Label>
                  <Select value={mood} onValueChange={setMood}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wie war dein Tag?" />
                    </SelectTrigger>
                    <SelectContent>
                      {moodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${option.color}`}
                            />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pnl">Tages-P&L</Label>
                <Input
                  id="pnl"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={pnl}
                  onChange={(e) => setPnl(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label>Inhalt *</Label>
                <RichTextEditor
                  content={content}
                  onChange={setContent}
                  placeholder="Schreibe über deinen Trading-Tag..."
                  onImageUpload={handleImageUpload}
                  className="min-h-[300px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  placeholder="Tag eingeben und Enter drücken"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Bilder
                <Button variant="outline" size="sm" onClick={handleAddImage}>
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Hinzufügen
                </Button>
              </CardTitle>
              <CardDescription>
                Screenshots und Chartbilder anhängen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Noch keine Bilder hinzugefügt
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {images.map((img, index) => (
                    <div key={index} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img}
                        alt={`Bild ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemoveImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Verknüpfte Trades
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTradeSelector(!showTradeSelector)}
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Verknüpfen
                </Button>
              </CardTitle>
              <CardDescription>
                Trades mit diesem Eintrag verbinden
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showTradeSelector && (
                <div className="mb-4 max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {availableTrades.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Keine Trades vorhanden
                    </p>
                  ) : (
                    availableTrades.slice(0, 20).map((trade) => (
                      <div
                        key={trade.id}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-muted transition-colors ${
                          linkedTrades.includes(trade.id) ? "bg-primary/10" : ""
                        }`}
                        onClick={() => handleToggleTrade(trade.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {trade.symbol}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              trade.side === "long"
                                ? "text-green-500 border-green-500/30"
                                : "text-red-500 border-red-500/30"
                            }
                          >
                            {trade.side}
                          </Badge>
                        </div>
                        <span
                          className={`text-sm font-medium ${
                            trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {trade.pnl >= 0 ? "+" : ""}
                          ${trade.pnl.toFixed(2)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {linkedTrades.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Noch keine Trades verknüpft
                </p>
              ) : (
                <div className="space-y-2">
                  {linkedTrades.map((tradeId) => {
                    const trade = availableTrades.find((t) => t.id === tradeId);
                    if (!trade) return null;
                    return (
                      <div
                        key={tradeId}
                        className="flex items-center justify-between p-2 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {trade.symbol}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              trade.side === "long"
                                ? "text-green-500 border-green-500/30"
                                : "text-red-500 border-red-500/30"
                            }
                          >
                            {trade.side}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {trade.pnl >= 0 ? "+" : ""}
                            ${trade.pnl.toFixed(2)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleToggleTrade(tradeId)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {entry.createdAt && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Erstellt:</span>
                    <span>
                      {new Date(entry.createdAt).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {entry.updatedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Letzte Änderung:
                      </span>
                      <span>
                        {new Date(entry.updatedAt).toLocaleDateString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
