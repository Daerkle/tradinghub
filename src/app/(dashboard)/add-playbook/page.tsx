"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PlaybookService } from "@/lib/models";

export default function AddPlaybookPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entryRules, setEntryRules] = useState("");
  const [exitRules, setExitRules] = useState("");
  const [riskManagement, setRiskManagement] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

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

  const handleSubmit = async () => {
    if (!name || !description) {
      toast.error("Bitte fülle alle Pflichtfelder aus");
      return;
    }

    setIsLoading(true);
    try {
      const rules = [
        ...entryRules.split("\n").filter((r) => r.trim()),
        ...exitRules.split("\n").filter((r) => r.trim()),
        ...riskManagement.split("\n").filter((r) => r.trim()),
      ];

      await PlaybookService.create({
        name,
        description,
        rules,
        winRate: 0,
        avgPnl: 0,
        trades: 0,
        tags,
      });
      toast.success("Playbook-Eintrag erfolgreich gespeichert");
      router.push("/playbook");
    } catch (err) {
      console.error("Failed to save playbook entry:", err);
      toast.error("Fehler beim Speichern des Playbook-Eintrags");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Playbook-Eintrag hinzufügen</h1>
        <p className="text-muted-foreground">
          Dokumentiere ein neues Trading-Setup oder eine Strategie
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Setup-Übersicht</CardTitle>
            <CardDescription>
              Grundlegende Informationen zu diesem Trading-Setup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Setup-Name *</Label>
              <Input
                id="name"
                placeholder="z.B. Opening Range Breakout"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung *</Label>
              <Textarea
                id="description"
                placeholder="Beschreibe das Setup und wann es angewendet wird..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                      className="cursor-pointer"
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

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Einstiegsregeln</CardTitle>
              <CardDescription>
                Wann und wie in diesen Trade eingestiegen wird
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="1. Warte auf die Opening Range...&#10;2. Achte auf Volumenbestätigung...&#10;3. Einstieg bei Breakout über High..."
                className="min-h-[150px]"
                value={entryRules}
                onChange={(e) => setEntryRules(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ausstiegsregeln</CardTitle>
              <CardDescription>
                Wann und wie aus diesem Trade ausgestiegen wird
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="1. Take Profit bei 2R...&#10;2. Trailing Stop nach erstem Ziel...&#10;3. Ausstieg vor wichtigen News..."
                className="min-h-[150px]"
                value={exitRules}
                onChange={(e) => setExitRules(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Risikomanagement</CardTitle>
            <CardDescription>
              Positionsgröße und Risikoregeln für dieses Setup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="- Max. Positionsgröße: 5% des Portfolios&#10;- Stop Loss: Unter dem Low der Breakout-Kerze&#10;- Mindest-CRV: 2:1..."
              className="min-h-[100px]"
              value={riskManagement}
              onChange={(e) => setRiskManagement(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button onClick={handleSubmit} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Setup speichern
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
