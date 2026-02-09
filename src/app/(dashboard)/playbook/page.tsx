"use client";

import { useEffect, useState } from "react";
import { Plus, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
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
import { PlaybookService, PlaybookData } from "@/lib/models";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function PlaybookPage() {
  const [setups, setSetups] = useState<PlaybookData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadSetups();
  }, []);

  async function loadSetups() {
    try {
      setIsLoading(true);
      const data = await PlaybookService.getAll();
      setSetups(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load playbook setups:", err);
      setError("Setups konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      setIsDeleting(true);
      await PlaybookService.delete(deleteId);
      setSetups(setups.filter((s) => s.id !== deleteId));
      toast.success("Setup gelöscht");
    } catch (err) {
      console.error("Failed to delete setup:", err);
      toast.error("Setup konnte nicht gelöscht werden");
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
            <h1 className="text-2xl font-bold tracking-tight">Playbook</h1>
            <p className="text-muted-foreground">
              Deine Trading-Setups und Strategien mit Performance-Metriken
            </p>
          </div>
          <Button asChild>
            <Link href="/add-playbook">
              <Plus className="mr-2 h-4 w-4" />
              Neues Setup
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-12 w-full" />
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
            <h1 className="text-2xl font-bold tracking-tight">Playbook</h1>
            <p className="text-muted-foreground">
              Deine Trading-Setups und Strategien mit Performance-Metriken
            </p>
          </div>
          <Button asChild>
            <Link href="/add-playbook">
              <Plus className="mr-2 h-4 w-4" />
              Neues Setup
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
          <h1 className="text-2xl font-bold tracking-tight">Playbook</h1>
          <p className="text-muted-foreground">
            Deine Trading-Setups und Strategien mit Performance-Metriken
          </p>
        </div>
        <Button asChild>
          <Link href="/add-playbook">
            <Plus className="mr-2 h-4 w-4" />
            Neues Setup
          </Link>
        </Button>
      </div>

      {setups.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">
              Noch keine Trading-Setups vorhanden.
            </p>
            <Button asChild>
              <Link href="/add-playbook">
                <Plus className="mr-2 h-4 w-4" />
                Erstes Setup erstellen
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {setups.map((setup) => (
            <Card
              key={setup.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{setup.name}</CardTitle>
                    <CardDescription>{setup.trades} trades</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex items-center gap-1 ${
                        setup.winRate >= 50 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {setup.winRate >= 50 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      <span className="font-semibold">{setup.winRate}%</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(setup.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {setup.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {setup.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      setup.avgPnl >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    Ø: {setup.avgPnl >= 0 ? "+" : ""}
                    {formatCurrency(setup.avgPnl)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setup löschen?</AlertDialogTitle>
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
