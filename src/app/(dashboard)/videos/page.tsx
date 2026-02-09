"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Play, Clock, Loader2, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VideoService, VideoData } from "@/lib/models";
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

const categoryColors: Record<string, string> = {
  recap: "bg-blue-500/10 text-blue-500",
  analysis: "bg-purple-500/10 text-purple-500",
  review: "bg-green-500/10 text-green-500",
  other: "bg-gray-500/10 text-gray-500",
};

export default function VideosPage() {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    try {
      setIsLoading(true);
      const data = await VideoService.getAll();
      setVideos(data);
    } catch (error) {
      console.error("Failed to load videos:", error);
      toast.error("Videos konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await VideoService.delete(id);
      setVideos(videos.filter((v) => v.id !== id));
      toast.success("Video gelöscht");
    } catch (error) {
      console.error("Failed to delete video:", error);
      toast.error("Video konnte nicht gelöscht werden");
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
          <h1 className="text-2xl font-bold tracking-tight">Videos</h1>
          <p className="text-muted-foreground">
            Videoaufnahmen und Analysen deiner Trades
          </p>
        </div>
        <Button asChild>
          <Link href="/add-video">
            <Plus className="mr-2 h-4 w-4" />
            Video hochladen
          </Link>
        </Button>
      </div>

      {videos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Video className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Noch keine Videos</h3>
            <p className="text-muted-foreground text-center mb-4">
              Beginne deine Trading-Sessions aufzunehmen und lade Videos hoch, um deine Performance zu überprüfen.
            </p>
            <Button asChild>
              <Link href="/add-video">
                <Plus className="mr-2 h-4 w-4" />
                Erstes Video hochladen
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <Card key={video.id} className="cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden group">
              <div className="aspect-video bg-muted flex items-center justify-center relative">
                {video.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="h-8 w-8 text-black ml-1" />
                    </div>
                  </>
                )}
                <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {video.duration}
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        disabled={deletingId === video.id}
                      >
                        {deletingId === video.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Video löschen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Bist du sicher, dass du dieses Video löschen möchtest? Dieser Vorgang kann nicht rückgängig gemacht werden.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(video.id)}>
                          Löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{video.title}</CardTitle>
                  <Badge variant="secondary" className={categoryColors[video.category] || categoryColors.other}>
                    {video.category}
                  </Badge>
                </div>
                <CardDescription>
                  {video.date ? new Date(video.date).toLocaleDateString("de-DE") : "Kein Datum"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {video.description || "Keine Beschreibung"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
