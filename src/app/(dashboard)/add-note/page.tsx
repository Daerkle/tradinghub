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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { NoteService } from "@/lib/models";

const categories = [
  { value: "setups", label: "Setups" },
  { value: "routines", label: "Routinen" },
  { value: "rules", label: "Regeln" },
  { value: "market", label: "Markt" },
  { value: "general", label: "Allgemein" },
];

export default function AddNotePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");

  const handleSubmit = async () => {
    if (!title || !content || !category) {
      toast.error("Bitte fülle alle Pflichtfelder aus");
      return;
    }

    setIsLoading(true);
    try {
      await NoteService.create({
        title,
        content,
        category,
        tags: [],
      });
      toast.success("Notiz erfolgreich gespeichert");
      router.push("/notes");
    } catch (err) {
      console.error("Failed to save note:", err);
      toast.error("Notiz konnte nicht gespeichert werden");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notiz hinzufügen</h1>
        <p className="text-muted-foreground">
          Erstelle eine schnelle Notiz oder Referenzmaterial
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notizdetails</CardTitle>
          <CardDescription>
            Füge deine Trading-Notizen und Referenzmaterialien hinzu
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                placeholder="z.B. AAPL Trading Setup"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategorie *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Inhalt *</Label>
            <Textarea
              id="content"
              placeholder="Schreibe hier deine Notiz..."
              className="min-h-[200px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button onClick={handleSubmit} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Notiz speichern
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
