"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { DiaryService, DiaryData } from "@/lib/models";

type MoodType = "positive" | "neutral" | "negative";

const moodColors: Record<MoodType, string> = {
  positive: "bg-green-500/10 text-green-500 border-green-500/30",
  neutral: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  negative: "bg-red-500/10 text-red-500 border-red-500/30",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function DiaryPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<DiaryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    try {
      setIsLoading(true);
      const data = await DiaryService.getAll();
      setEntries(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load diary entries:", err);
      setError("Einträge konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      setIsDeleting(true);
      await DiaryService.delete(deleteId);
      setEntries(entries.filter((e) => e.id !== deleteId));
      toast.success("Eintrag gelöscht");
    } catch (err) {
      console.error("Failed to delete entry:", err);
      toast.error("Eintrag konnte nicht gelöscht werden");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trading-Tagebuch</h1>
            <p className="text-muted-foreground">
              Dokumentiere deine Gedanken und Erkenntnisse von jedem Trading-Tag
            </p>
          </div>
          <Button asChild>
            <Link href="/add-diary">
              <Plus className="mr-2 h-4 w-4" />
              Neuer Eintrag
            </Link>
          </Button>
        </div>

        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Trading-Tagebuch</h1>
            <p className="text-muted-foreground">
              Dokumentiere deine Gedanken und Erkenntnisse von jedem Trading-Tag
            </p>
          </div>
          <Button asChild>
            <Link href="/add-diary">
              <Plus className="mr-2 h-4 w-4" />
              Neuer Eintrag
            </Link>
          </Button>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading-Tagebuch</h1>
          <p className="text-muted-foreground">
            Dokumentiere deine Gedanken und Erkenntnisse von jedem Trading-Tag
          </p>
        </div>
        <Button asChild>
          <Link href="/add-diary">
            <Plus className="mr-2 h-4 w-4" />
            Neuer Eintrag
          </Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">
              Noch keine Tagebucheinträge vorhanden.
            </p>
            <Button asChild>
              <Link href="/add-diary">
                <Plus className="mr-2 h-4 w-4" />
                Ersten Eintrag erstellen
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <Card
              key={entry.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors group"
              onClick={() => router.push(`/diary/${entry.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {entry.title}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </CardTitle>
                    <CardDescription>
                      {new Date(entry.date).toLocaleDateString("de-DE", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={moodColors[entry.mood as MoodType]}
                    >
                      {entry.mood === "positive" ? "Positiv" : entry.mood === "neutral" ? "Neutral" : "Negativ"}
                    </Badge>
                    <span
                      className={`font-semibold ${
                        entry.pnl >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {entry.pnl >= 0 ? "+" : ""}
                      {formatCurrency(entry.pnl)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(entry.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground line-clamp-2">
                  {entry.content.replace(/<[^>]*>/g, '')}
                </p>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {entry.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Vorgang kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Löschen..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
