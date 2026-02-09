"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Video, X, Play } from "lucide-react";
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

const videoCategories = [
  { value: "recap", label: "Täglicher Rückblick" },
  { value: "analysis", label: "Trade-Analyse" },
  { value: "review", label: "Wöchentlicher Review" },
  { value: "tutorial", label: "Tutorial" },
  { value: "other", label: "Sonstiges" },
];

export default function AddVideoPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<number>(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file type
      if (!selectedFile.type.startsWith("video/")) {
        toast.error("Bitte wähle eine Videodatei aus");
        return;
      }

      // Check file size (max 500MB)
      if (selectedFile.size > 500 * 1024 * 1024) {
        toast.error("Videodatei darf maximal 500MB groß sein");
        return;
      }

      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setPreview(url);
    }
  };

  const handleVideoLoad = () => {
    if (videoRef.current) {
      setDuration(Math.round(videoRef.current.duration));
    }
  };

  const handleRemoveFile = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setFile(null);
    setPreview(null);
    setDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = async () => {
    if (!file || !title) {
      toast.error("Bitte fülle alle Pflichtfelder aus");
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Implement actual upload logic with Parse
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("Video erfolgreich hochgeladen");
      router.push("/videos");
    } catch {
      toast.error("Video konnte nicht hochgeladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Video hochladen</h1>
        <p className="text-muted-foreground">
          Lade ein Trading-Video zur Überprüfung und Analyse hoch
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Video hochladen</CardTitle>
            <CardDescription>
              Wähle oder ziehe eine Videodatei zum Hochladen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  src={preview}
                  className="w-full rounded-lg border"
                  controls
                  onLoadedMetadata={handleVideoLoad}
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
                {duration > 0 && (
                  <div className="absolute bottom-4 left-4 bg-black/70 text-white px-2 py-1 rounded text-sm flex items-center gap-1">
                    <Play className="h-3 w-3" />
                    {formatDuration(duration)}
                  </div>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Video className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Klicken zum Hochladen</span> oder per Drag & Drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    MP4, WebM oder MOV (MAX. 500MB)
                  </p>
                </div>
                <Input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Videodetails</CardTitle>
            <CardDescription>
              Füge Informationen zu diesem Video hinzu
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                placeholder="z.B. Montag Morgen Rückblick"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Kategorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {videoCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                placeholder="Beschreibe den Inhalt dieses Videos..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            {file && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">{file.name}</p>
                <p className="text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                  {duration > 0 && ` • ${formatDuration(duration)}`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button onClick={handleSubmit} disabled={isLoading || !file}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Upload className="mr-2 h-4 w-4" />
          Video hochladen
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
