"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Folder,
  FolderPlus,
  Pin,
  PinOff,
  MoreVertical,
  FileText,
  Target,
  BarChart3,
  Calendar,
  BookOpen,
  AlertTriangle,
  Globe,
  ChevronRight,
  Edit3,
  Move,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  NoteService,
  NoteFolderService,
  NoteTemplates,
  NoteData,
  NoteFolderData,
  NoteTemplate,
} from "@/lib/models";

const categoryColors: Record<string, string> = {
  setups: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  routines: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  rules: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  market: "bg-green-500/10 text-green-500 border-green-500/20",
  review: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  mistakes: "bg-red-500/10 text-red-500 border-red-500/20",
  general: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const folderColors: Record<string, string> = {
  gray: "text-gray-500",
  blue: "text-blue-500",
  green: "text-green-500",
  yellow: "text-yellow-500",
  red: "text-red-500",
  purple: "text-purple-500",
  pink: "text-pink-500",
  orange: "text-orange-500",
};

const templateIcons: Record<string, React.ReactNode> = {
  target: <Target className="h-5 w-5" />,
  chart: <BarChart3 className="h-5 w-5" />,
  calendar: <Calendar className="h-5 w-5" />,
  book: <BookOpen className="h-5 w-5" />,
  alert: <AlertTriangle className="h-5 w-5" />,
  globe: <Globe className="h-5 w-5" />,
};

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [folders, setFolders] = useState<NoteFolderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveNoteId, setMoveNoteId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("blue");
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      const [notesData, foldersData] = await Promise.all([
        NoteService.getAll(),
        NoteFolderService.getAll(),
      ]);
      setNotes(notesData);
      setFolders(foldersData);
      setError(null);
    } catch (err) {
      console.error("Failed to load data:", err);
      setError("Daten konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteNote() {
    if (!deleteNoteId) return;

    try {
      setIsDeleting(true);
      await NoteService.delete(deleteNoteId);
      setNotes(notes.filter((n) => n.id !== deleteNoteId));
      toast.success("Notiz gelöscht");
    } catch (err) {
      console.error("Failed to delete note:", err);
      toast.error("Notiz konnte nicht gelöscht werden");
    } finally {
      setIsDeleting(false);
      setDeleteNoteId(null);
    }
  }

  async function handleDeleteFolder() {
    if (!deleteFolderId) return;

    try {
      setIsDeleting(true);
      // Move notes in folder to root before deleting
      const notesInFolder = notes.filter((n) => n.folderId === deleteFolderId);
      for (const note of notesInFolder) {
        await NoteService.moveToFolder(note.id, null);
      }
      await NoteFolderService.delete(deleteFolderId);
      setFolders(folders.filter((f) => f.id !== deleteFolderId));
      setNotes(
        notes.map((n) =>
          n.folderId === deleteFolderId ? { ...n, folderId: undefined } : n
        )
      );
      if (selectedFolderId === deleteFolderId) {
        setSelectedFolderId(null);
      }
      toast.success("Ordner gelöscht");
    } catch (err) {
      console.error("Failed to delete folder:", err);
      toast.error("Ordner konnte nicht gelöscht werden");
    } finally {
      setIsDeleting(false);
      setDeleteFolderId(null);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;

    try {
      const newFolder = await NoteFolderService.create({
        name: newFolderName,
        icon: "folder",
        color: newFolderColor,
        order: folders.length,
      });
      setFolders([...folders, newFolder]);
      setNewFolderName("");
      setShowNewFolderDialog(false);
      toast.success("Ordner erstellt");
    } catch (err) {
      console.error("Failed to create folder:", err);
      toast.error("Ordner konnte nicht erstellt werden");
    }
  }

  async function handleTogglePin(noteId: string) {
    try {
      const newPinned = await NoteService.togglePin(noteId);
      setNotes(
        notes.map((n) => (n.id === noteId ? { ...n, isPinned: newPinned } : n))
      );
      toast.success(newPinned ? "Notiz angepinnt" : "Pin entfernt");
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      toast.error("Pin konnte nicht geändert werden");
    }
  }

  async function handleMoveNote(targetFolderId: string | null) {
    if (!moveNoteId) return;

    try {
      await NoteService.moveToFolder(moveNoteId, targetFolderId);
      setNotes(
        notes.map((n) =>
          n.id === moveNoteId
            ? { ...n, folderId: targetFolderId || undefined }
            : n
        )
      );
      setShowMoveDialog(false);
      setMoveNoteId(null);
      toast.success("Notiz verschoben");
    } catch (err) {
      console.error("Failed to move note:", err);
      toast.error("Notiz konnte nicht verschoben werden");
    }
  }

  async function handleCreateFromTemplate(template: NoteTemplate) {
    try {
      const newNote = await NoteService.create({
        title: template.name,
        content: template.content,
        category: template.category,
        tags: [],
        folderId: selectedFolderId || undefined,
        templateName: template.id,
      });
      setNotes([newNote, ...notes]);
      setShowTemplateDialog(false);
      router.push(`/notes/${newNote.id}`);
    } catch (err) {
      console.error("Failed to create from template:", err);
      toast.error("Notiz konnte nicht erstellt werden");
    }
  }

  // Filter notes based on search and selected folder
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      searchQuery === "" ||
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFolder =
      selectedFolderId === null
        ? true
        : selectedFolderId === "all"
        ? true
        : selectedFolderId === "pinned"
        ? note.isPinned
        : note.folderId === selectedFolderId;

    return matchesSearch && matchesFolder;
  });

  // Sort: pinned first, then by updatedAt
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const currentFolderName =
    selectedFolderId === null
      ? "Alle Notizen"
      : selectedFolderId === "pinned"
      ? "Angepinnt"
      : folders.find((f) => f.id === selectedFolderId)?.name || "Alle Notizen";

  const notesInCurrentFolder =
    selectedFolderId === null || selectedFolderId === "all"
      ? notes.filter((n) => !n.folderId)
      : selectedFolderId === "pinned"
      ? notes.filter((n) => n.isPinned)
      : notes.filter((n) => n.folderId === selectedFolderId);

  if (isLoading) {
    return (
      <div className="flex h-full">
        {/* Sidebar Skeleton */}
        <div className="hidden md:block w-64 border-r p-4 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        {/* Content Skeleton */}
        <div className="flex-1 p-4 sm:p-4 space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar with Folders */}
      <div className={cn(
        "w-64 border-r bg-muted/30 flex flex-col",
        "fixed inset-y-0 left-0 z-40 md:static md:z-auto",
        "transition-transform duration-200",
        showSidebar ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Notebook</h2>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {/* All Notes */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              selectedFolderId === null
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <FileText className="h-4 w-4" />
            <span>Alle Notizen</span>
            <span className="ml-auto text-xs opacity-70">{notes.length}</span>
          </button>

          {/* Pinned */}
          <button
            onClick={() => setSelectedFolderId("pinned")}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              selectedFolderId === "pinned"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <Pin className="h-4 w-4" />
            <span>Angepinnt</span>
            <span className="ml-auto text-xs opacity-70">
              {notes.filter((n) => n.isPinned).length}
            </span>
          </button>

          <div className="h-px bg-border my-2" />

          {/* Folders */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Ordner
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowNewFolderDialog(true)}
              >
                <FolderPlus className="h-3 w-3" />
              </Button>
            </div>

            {folders.map((folder) => (
              <div key={folder.id} className="group relative">
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                    selectedFolderId === folder.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <Folder
                    className={cn("h-4 w-4", folderColors[folder.color])}
                  />
                  <span className="truncate">{folder.name}</span>
                  <span className="ml-auto text-xs opacity-70">
                    {notes.filter((n) => n.folderId === folder.id).length}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setDeleteFolderId(folder.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            {folders.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-2">
                Keine Ordner vorhanden
              </p>
            )}
          </div>
        </div>

        {/* Templates Section */}
        <div className="border-t p-4">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setShowTemplateDialog(true)}
          >
            <Copy className="h-4 w-4 mr-2" />
            Aus Vorlage erstellen
          </Button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
            <h1 className="text-lg sm:text-xl font-semibold">{currentFolderName}</h1>
            <Badge variant="secondary">{sortedNotes.length}</Badge>
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button asChild size="sm">
              <Link href="/notes/new">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Neue Notiz</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Notes Grid */}
        <div className="flex-1 overflow-auto p-3 sm:p-4">
          {sortedNotes.length === 0 ? (
            <Card className="max-w-md mx-auto mt-8">
              <CardContent className="pt-4 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? "Keine Notizen gefunden."
                    : "Noch keine Notizen in diesem Ordner."}
                </p>
                {!searchQuery && (
                  <div className="flex flex-col gap-2">
                    <Button asChild>
                      <Link href="/notes/new">
                        <Plus className="h-4 w-4 mr-2" />
                        Neue Notiz erstellen
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowTemplateDialog(true)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Aus Vorlage erstellen
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedNotes.map((note) => (
                <Card
                  key={note.id}
                  className={cn(
                    "group relative cursor-pointer hover:shadow-md transition-all",
                    note.isPinned && "ring-1 ring-primary/30"
                  )}
                  onClick={() => router.push(`/notes/${note.id}`)}
                >
                  {note.isPinned && (
                    <div className="absolute top-2 right-2">
                      <Pin className="h-3 w-3 text-primary" />
                    </div>
                  )}

                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between pr-6">
                      <CardTitle className="text-base line-clamp-1">
                        {note.title}
                      </CardTitle>
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          categoryColors[note.category] || categoryColors.general
                        )}
                      >
                        {note.category}
                      </Badge>
                      <span className="text-xs">
                        {new Date(note.updatedAt).toLocaleDateString("de-DE")}
                      </span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
                      {note.content.replace(/[#*\-\[\]|]/g, "").slice(0, 150)}
                    </p>

                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {note.tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {note.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{note.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>

                  {/* Actions Overlay */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/notes/${note.id}`);
                          }}
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePin(note.id);
                          }}
                        >
                          {note.isPinned ? (
                            <>
                              <PinOff className="h-4 w-4 mr-2" />
                              Pin entfernen
                            </>
                          ) : (
                            <>
                              <Pin className="h-4 w-4 mr-2" />
                              Anpinnen
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveNoteId(note.id);
                            setShowMoveDialog(true);
                          }}
                        >
                          <Move className="h-4 w-4 mr-2" />
                          Verschieben
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteNoteId(note.id);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Note Dialog */}
      <AlertDialog open={!!deleteNoteId} onOpenChange={() => setDeleteNoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notiz löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Vorgang kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Löschen..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Dialog */}
      <AlertDialog
        open={!!deleteFolderId}
        onOpenChange={() => setDeleteFolderId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ordner löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Notizen im Ordner werden in &quot;Alle Notizen&quot; verschoben.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Löschen..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen Ordner erstellen</DialogTitle>
            <DialogDescription>
              Organisiere deine Notizen in Ordnern.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                placeholder="Ordnername"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Farbe</Label>
              <div className="flex gap-2 flex-wrap">
                {Object.keys(folderColors).map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewFolderColor(color)}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-transform",
                      newFolderColor === color && "ring-2 ring-offset-2 ring-primary"
                    )}
                  >
                    <Folder className={cn("h-5 w-5", folderColors[color])} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Note Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notiz verschieben</DialogTitle>
            <DialogDescription>
              Wähle einen Zielordner für die Notiz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <button
              onClick={() => handleMoveNote(null)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-left"
            >
              <FileText className="h-4 w-4" />
              <span>Alle Notizen (Kein Ordner)</span>
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => handleMoveNote(folder.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-left"
              >
                <Folder className={cn("h-4 w-4", folderColors[folder.color])} />
                <span>{folder.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vorlage auswählen</DialogTitle>
            <DialogDescription>
              Starte mit einer vorgefertigten Vorlage für deine Notiz.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4 md:grid-cols-2">
            {NoteTemplates.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleCreateFromTemplate(template)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "p-2 rounded-lg",
                        categoryColors[template.category] || categoryColors.general
                      )}
                    >
                      {templateIcons[template.icon] || (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {template.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
