"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Trash2,
  Pin,
  PinOff,
  FolderOpen,
  Clock,
  Tag,
  X,
  Plus,
  MoreHorizontal,
  Copy,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { NoteData, NoteFolderData, NoteService, NoteFolderService } from "@/lib/models";
import { toast } from "sonner";

const categories = [
  { value: "trading", label: "Trading" },
  { value: "analysis", label: "Analyse" },
  { value: "strategy", label: "Strategie" },
  { value: "psychology", label: "Psychologie" },
  { value: "education", label: "Bildung" },
  { value: "misc", label: "Sonstiges" },
];

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const noteId = params.id as string;
  const isNew = noteId === "new";

  const [note, setNote] = useState<NoteData | null>(null);
  const [folders, setFolders] = useState<NoteFolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("misc");
  const [tags, setTags] = useState<string[]>([]);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [isPinned, setIsPinned] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Load note and folders
  useEffect(() => {
    async function loadData() {
      try {
        const foldersData = await NoteFolderService.getAll();
        setFolders(foldersData);

        if (!isNew) {
          const noteData = await NoteService.getById(noteId);
          if (noteData) {
            setNote(noteData);
            setTitle(noteData.title);
            setContent(noteData.content);
            setCategory(noteData.category);
            setTags(noteData.tags || []);
            setFolderId(noteData.folderId);
            setIsPinned(noteData.isPinned || false);
          } else {
            toast.error("Notiz nicht gefunden", {
              description: "Die angeforderte Notiz existiert nicht.",
            });
            router.push("/notes");
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Fehler", {
          description: "Daten konnten nicht geladen werden.",
        });
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [noteId, isNew, router]);

  // Track changes
  useEffect(() => {
    if (isNew) {
      setHasChanges(title.length > 0 || content.length > 0);
    } else if (note) {
      const changed =
        title !== note.title ||
        content !== note.content ||
        category !== note.category ||
        JSON.stringify(tags) !== JSON.stringify(note.tags || []) ||
        folderId !== note.folderId ||
        isPinned !== (note.isPinned || false);
      setHasChanges(changed);
    }
  }, [title, content, category, tags, folderId, isPinned, note, isNew]);

  // Auto-save with debounce
  const autoSave = useCallback(async () => {
    if (!hasChanges || saving || isNew) return;

    setSaving(true);
    try {
      await NoteService.update(noteId, {
        title,
        content,
        category,
        tags,
        folderId,
        isPinned,
      });
      setHasChanges(false);
    } catch (error) {
      console.error("Auto-save error:", error);
    } finally {
      setSaving(false);
    }
  }, [hasChanges, saving, isNew, noteId, title, content, category, tags, folderId, isPinned]);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(autoSave, 30000);
    return () => clearInterval(interval);
  }, [autoSave]);

  // Save note
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Titel erforderlich", {
        description: "Bitte gib einen Titel für die Notiz ein.",
      });
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const newNote = await NoteService.create({
          title,
          content,
          category,
          tags,
          folderId,
          isPinned,
        });
        toast.success("Notiz erstellt", {
          description: "Die Notiz wurde erfolgreich erstellt.",
        });
        router.push(`/notes/${newNote.id}`);
      } else {
        await NoteService.update(noteId, {
          title,
          content,
          category,
          tags,
          folderId,
          isPinned,
        });
        setHasChanges(false);
        toast.success("Gespeichert", {
          description: "Die Notiz wurde erfolgreich gespeichert.",
        });
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Fehler", {
        description: "Die Notiz konnte nicht gespeichert werden.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete note
  const handleDelete = async () => {
    try {
      await NoteService.delete(noteId);
      toast.success("Gelöscht", {
        description: "Die Notiz wurde gelöscht.",
      });
      router.push("/notes");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Fehler", {
        description: "Die Notiz konnte nicht gelöscht werden.",
      });
    }
  };

  // Toggle pin
  const handleTogglePin = () => {
    setIsPinned(!isPinned);
  };

  // Add tag
  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  // Remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Duplicate note
  const handleDuplicate = async () => {
    try {
      const duplicated = await NoteService.create({
        title: `${title} (Kopie)`,
        content,
        category,
        tags,
        folderId,
        isPinned: false,
      });
      toast.success("Notiz dupliziert", {
        description: "Eine Kopie der Notiz wurde erstellt.",
      });
      router.push(`/notes/${duplicated.id}`);
    } catch (error) {
      console.error("Duplicate error:", error);
      toast.error("Fehler", {
        description: "Die Notiz konnte nicht dupliziert werden.",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/notes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isNew ? "Neue Notiz" : "Notiz bearbeiten"}
            </h1>
            {!isNew && note && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-3 w-3" />
                Zuletzt bearbeitet: {new Date(note.updatedAt).toLocaleString("de-DE")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-yellow-600">
              Ungespeicherte Änderungen
            </Badge>
          )}
          {saving && (
            <Badge variant="outline" className="text-blue-600">
              Speichert...
            </Badge>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={handleTogglePin}
            className={isPinned ? "text-yellow-600" : ""}
          >
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>

          {!isNew && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplizieren
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button onClick={handleSave} disabled={saving || (!isNew && !hasChanges)}>
            <Save className="h-4 w-4 mr-2" />
            {isNew ? "Erstellen" : "Speichern"}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Editor */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <Input
                placeholder="Titel der Notiz..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xl font-semibold border-none px-0 focus-visible:ring-0"
              />
            </CardContent>
          </Card>

          <Card className="min-h-[500px]">
            <CardContent className="pt-6">
              <Textarea
                placeholder="Schreibe deine Notiz hier..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[450px] border-none resize-none focus-visible:ring-0"
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Category */}
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Kategorie
              </h3>
            </CardHeader>
            <CardContent>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Folder */}
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Ordner
              </h3>
            </CardHeader>
            <CardContent>
              <Select
                value={folderId || "none"}
                onValueChange={(value) => setFolderId(value === "none" ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ordner wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Ordner</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: folder.color }}
                        />
                        {folder.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Neuer Tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button size="icon" variant="outline" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info */}
          {!isNew && note && (
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold text-sm">Informationen</h3>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Erstellt:</span>
                  <span>{new Date(note.createdAt).toLocaleDateString("de-DE")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bearbeitet:</span>
                  <span>{new Date(note.updatedAt).toLocaleDateString("de-DE")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Zeichen:</span>
                  <span>{content.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Wörter:</span>
                  <span>{content.split(/\s+/).filter(Boolean).length}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notiz löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Die Notiz wird
              permanent gelöscht.
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
  );
}
