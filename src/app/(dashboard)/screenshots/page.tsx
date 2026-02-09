"use client";

import { useState, useEffect } from "react";
import { Plus, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScreenshotService, ScreenshotData } from "@/lib/models";
import { toast } from "sonner";
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

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadScreenshots();
  }, []);

  const loadScreenshots = async () => {
    try {
      setIsLoading(true);
      const data = await ScreenshotService.getAll();
      setScreenshots(data);
    } catch (error) {
      console.error("Failed to load screenshots:", error);
      toast.error("Screenshots konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await ScreenshotService.delete(id);
      setScreenshots(screenshots.filter((s) => s.id !== id));
      toast.success("Screenshot gelöscht");
    } catch (error) {
      console.error("Failed to delete screenshot:", error);
      toast.error("Screenshot konnte nicht gelöscht werden");
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Screenshots</h1>
          <p className="text-muted-foreground">
            Visuelle Dokumentation deiner Trades und Setups
          </p>
        </div>
        <Button asChild>
          <Link href="/add-screenshot">
            <Plus className="mr-2 h-4 w-4" />
            Screenshot hinzufügen
          </Link>
        </Button>
      </div>

      {screenshots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Noch keine Screenshots</h3>
            <p className="text-muted-foreground text-center mb-4">
              Beginne deine Trades mit Screenshots zu dokumentieren, um deine Setups und Fortschritte zu verfolgen.
            </p>
            <Button asChild>
              <Link href="/add-screenshot">
                <Plus className="mr-2 h-4 w-4" />
                Ersten Screenshot hinzufügen
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {screenshots.map((screenshot) => (
            <Card key={screenshot.id} className="overflow-hidden group">
              <div className="aspect-video bg-muted flex items-center justify-center relative">
                {screenshot.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={screenshot.imageUrl}
                    alt={screenshot.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-12 w-12 text-muted-foreground" />
                )}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        disabled={deletingId === screenshot.id}
                      >
                        {deletingId === screenshot.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Screenshot löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Bist du sicher, dass du diesen Screenshot löschen möchtest? Dieser Vorgang kann nicht rückgängig gemacht werden.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(screenshot.id)}>
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{screenshot.title}</CardTitle>
                  {screenshot.symbol && <Badge>{screenshot.symbol}</Badge>}
                </div>
                <CardDescription>
                  {screenshot.date ? new Date(screenshot.date).toLocaleDateString("de-DE") : "Kein Datum"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {screenshot.description || "Keine Beschreibung"}
                </p>
                {screenshot.setup && (
                  <Badge variant="secondary" className="mt-2">
                    {screenshot.setup}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
