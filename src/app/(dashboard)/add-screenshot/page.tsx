"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Save, Loader2, Image as ImageIcon, X } from "lucide-react";
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

const setupTypes = [
  "Breakout",
  "VWAP Bounce",
  "Gap and Go",
  "Support Bounce",
  "Resistance Short",
  "Trend Following",
  "Reversal",
  "Other",
];

export default function AddScreenshotPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [symbol, setSymbol] = useState("");
  const [setup, setSetup] = useState("");
  const [description, setDescription] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setPreview(null);
  };

  const handleSubmit = async () => {
    if (!file || !title || !symbol) {
      toast.error("Bitte fülle alle Pflichtfelder aus");
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Implement actual upload logic with Parse
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Screenshot erfolgreich hochgeladen");
      router.push("/screenshots");
    } catch {
      toast.error("Fehler beim Hochladen des Screenshots");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Screenshot hinzufügen</h1>
        <p className="text-muted-foreground">
          Lade einen Chart-Screenshot mit Trade-Details hoch
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bild hochladen</CardTitle>
            <CardDescription>
              Wähle oder ziehe einen Screenshot zum Hochladen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              <div className="relative">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full rounded-lg border"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Klicken zum Hochladen</span> oder per Drag & Drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG oder GIF (MAX. 10MB)
                  </p>
                </div>
                <Input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Screenshot-Details</CardTitle>
            <CardDescription>
              Füge Informationen zu diesem Trade hinzu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                placeholder="z.B. AAPL Perfekter Einstieg"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol *</Label>
                <Input
                  id="symbol"
                  placeholder="z.B. AAPL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup">Setup-Typ</Label>
                <Select value={setup} onValueChange={setSetup}>
                  <SelectTrigger>
                    <SelectValue placeholder="Setup auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {setupTypes.map((type) => (
                      <SelectItem key={type} value={type.toLowerCase()}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                placeholder="Beschreibe den Trade und wichtige Erkenntnisse..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button onClick={handleSubmit} disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Upload className="mr-2 h-4 w-4" />
          Screenshot hochladen
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
