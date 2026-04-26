"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Save, User, Bell, Palette, Database, Shield, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { IBFlexQuerySync } from "@/components/trades/ib-flex-query-sync";
import { useUserSettingsStore } from "@/stores/user-settings-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  DEFAULT_USER_PREFERENCES,
  DEFAULT_USER_PROFILE,
  type SupportedTheme,
} from "@/lib/user-settings";

const TIMEZONE_OPTIONS = [
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "UTC", label: "UTC" },
];

type SettingsFormState = {
  username: string;
  email: string;
  theme: SupportedTheme;
  compactMode: boolean;
  displayCurrency: "USD" | "EUR" | "GBP";
  timezone: string;
  dailySummary: boolean;
  tradeNotifications: boolean;
  ibFlexToken: string;
  ibFlexQueryId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const DEFAULT_FORM_STATE: SettingsFormState = {
  ...DEFAULT_USER_PROFILE,
  ...DEFAULT_USER_PREFERENCES,
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function SettingsPage() {
  const { setTheme } = useTheme();
  const {
    profile,
    preferences,
    isLoading,
    isSaving,
    hasLoaded,
    loadSettings,
    saveSettings,
    patchPreferences,
  } = useUserSettingsStore();
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);
  const [localOverrides, setLocalOverrides] = useState<Partial<SettingsFormState>>({});

  useEffect(() => {
    if (!hasLoaded) {
      loadSettings().catch((error) => {
        console.error("Failed to load settings page:", error);
        toast.error("Einstellungen konnten nicht geladen werden");
      });
    }
  }, [hasLoaded, loadSettings]);

  const form = useMemo<SettingsFormState>(
    () => ({
      ...DEFAULT_FORM_STATE,
      username: profile.username,
      email: profile.email,
      theme: preferences.theme,
      compactMode: preferences.compactMode,
      displayCurrency: preferences.displayCurrency,
      timezone: preferences.timezone,
      dailySummary: preferences.dailySummary,
      tradeNotifications: preferences.tradeNotifications,
      ibFlexToken: preferences.ibFlexToken,
      ibFlexQueryId: preferences.ibFlexQueryId,
      ...localOverrides,
    }),
    [localOverrides, preferences, profile]
  );

  const setField = <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => {
    setLocalOverrides((current) => ({ ...current, [key]: value }));
  };

  const handleThemeChange = (value: SupportedTheme) => {
    setTheme(value);
    patchPreferences({ theme: value });
    setField("theme", value);
  };

  const handleCompactModeChange = (checked: boolean) => {
    patchPreferences({ compactMode: checked });
    setField("compactMode", checked);
  };

  const handleCredentialSave = async (token: string, queryId: string) => {
    setLocalOverrides((current) => ({
      ...current,
      ibFlexToken: token,
      ibFlexQueryId: queryId,
    }));

    try {
      await saveSettings({
        preferences: {
          ibFlexToken: token,
          ibFlexQueryId: queryId,
        },
      });
      toast.success("IB-Einstellungen gespeichert");
    } catch (error) {
      console.error("Failed to save IB settings:", error);
      toast.error(error instanceof Error ? error.message : "IB-Einstellungen konnten nicht gespeichert werden");
    }
  };

  const handleSave = async () => {
    if (!form.username.trim()) {
      toast.error("Bitte einen Benutzernamen eingeben");
      return;
    }

    if (!form.email.trim()) {
      toast.error("Bitte eine E-Mail eingeben");
      return;
    }

    if (form.newPassword || form.confirmPassword || form.currentPassword) {
      if (!form.currentPassword) {
        toast.error("Bitte gib dein aktuelles Passwort ein");
        return;
      }
      if (form.newPassword.length < 8) {
        toast.error("Das neue Passwort muss mindestens 8 Zeichen lang sein");
        return;
      }
      if (form.newPassword !== form.confirmPassword) {
        toast.error("Die neuen Passwörter stimmen nicht überein");
        return;
      }
    }

    try {
      const result = await saveSettings({
        profile: {
          username: form.username,
          email: form.email,
        },
        preferences: {
          theme: form.theme,
          compactMode: form.compactMode,
          displayCurrency: form.displayCurrency,
          timezone: form.timezone,
          dailySummary: form.dailySummary,
          tradeNotifications: form.tradeNotifications,
          ibFlexToken: form.ibFlexToken,
          ibFlexQueryId: form.ibFlexQueryId,
        },
        password: form.newPassword
          ? {
              currentPassword: form.currentPassword,
              newPassword: form.newPassword,
            }
          : undefined,
      });

      updateUserProfile({
        username: result.profile.username,
        email: result.profile.email,
      });
      setTheme(result.preferences.theme);
      setLocalOverrides({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Einstellungen gespeichert");
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error(error instanceof Error ? error.message : "Einstellungen konnten nicht gespeichert werden");
    }
  };

  return (
    <div className="space-y-5 sm:space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">
          Verwalte dein Konto und App-Einstellungen
        </p>
      </div>

      {!hasLoaded && isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">Einstellungen werden geladen...</span>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 sm:gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <CardTitle>Profil</CardTitle>
            </div>
            <CardDescription>
              Aktualisiere deine persönlichen Informationen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="username">Benutzername</Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(event) => setField("username", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setField("email", event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <CardTitle>Erscheinungsbild</CardTitle>
            </div>
            <CardDescription>
              Passe das Aussehen an
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="space-y-0.5">
                <Label>Design</Label>
                <p className="text-sm text-muted-foreground">
                  Wähle dein bevorzugtes Farbschema
                </p>
              </div>
              <Select value={form.theme} onValueChange={(value) => handleThemeChange(value as SupportedTheme)}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Hell</SelectItem>
                  <SelectItem value="dark">Dunkel</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>Kompaktmodus</Label>
                <p className="text-sm text-muted-foreground">
                  Dichtet Cards und Seitenabstände stärker
                </p>
              </div>
              <Switch checked={form.compactMode} onCheckedChange={handleCompactModeChange} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Benachrichtigungen</CardTitle>
            </div>
            <CardDescription>
              Benachrichtigungseinstellungen konfigurieren
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>Tägliche Zusammenfassung</Label>
                <p className="text-sm text-muted-foreground">
                  Tägliche Performance-Zusammenfassungen erhalten
                </p>
              </div>
              <Switch
                checked={form.dailySummary}
                onCheckedChange={(checked) => setField("dailySummary", checked)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>Trade-Benachrichtigungen</Label>
                <p className="text-sm text-muted-foreground">
                  Benachrichtigt werden, wenn Trades importiert werden
                </p>
              </div>
              <Switch
                checked={form.tradeNotifications}
                onCheckedChange={(checked) => setField("tradeNotifications", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <CardTitle>Daten</CardTitle>
            </div>
            <CardDescription>
              Verwalte deine Trading-Daten
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="space-y-0.5">
                <Label>Standardwährung</Label>
                <p className="text-sm text-muted-foreground">
                  Anzeige und FX-Umrechnung für Preise, P&amp;L und Reports
                </p>
              </div>
              <Select
                value={form.displayCurrency}
                onValueChange={(value) => setField("displayCurrency", value as SettingsFormState["displayCurrency"])}
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="space-y-0.5">
                <Label>Zeitzone</Label>
                <p className="text-sm text-muted-foreground">
                  Deine lokale Trading-Zeitzone
                </p>
              </div>
              <Select value={form.timezone} onValueChange={(value) => setField("timezone", value)}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              <CardTitle>Interactive Brokers</CardTitle>
            </div>
            <CardDescription>
              Verbinde dein IB-Konto für automatischen Trade-Import via Flex Query API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IBFlexQuerySync
              savedToken={form.ibFlexToken}
              savedQueryId={form.ibFlexQueryId}
              onCredentialsSave={(token, queryId) => {
                void handleCredentialSave(token, queryId);
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Sicherheit</CardTitle>
            </div>
            <CardDescription>
              Verwalte deine Kontosicherheit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Aktuelles Passwort</Label>
              <Input
                id="current-password"
                type="password"
                value={form.currentPassword}
                onChange={(event) => setField("currentPassword", event.target.value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">Neues Passwort</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={form.newPassword}
                  onChange={(event) => setField("newPassword", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Passwort bestätigen</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => setField("confirmPassword", event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving || isLoading} className="min-w-[210px] shadow-lg">
          {(isSaving || isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Änderungen speichern
        </Button>
      </div>
    </div>
  );
}
