"use client";

import { useState } from "react";
import { Save, User, Bell, Palette, Database, Shield, BarChart3 } from "lucide-react";
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

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success("Einstellungen gespeichert");
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">
          Verwalte dein Konto und App-Einstellungen
        </p>
      </div>

      <div className="grid gap-6">
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
                <Input id="username" defaultValue="trader123" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue="trader@example.com" />
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Design</Label>
                <p className="text-sm text-muted-foreground">
                  Wähle dein bevorzugtes Farbschema
                </p>
              </div>
              <Select defaultValue="dark">
                <SelectTrigger className="w-full sm:w-32">
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
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Kompaktmodus</Label>
                <p className="text-sm text-muted-foreground">
                  Kleinere Abstände und Schriften verwenden
                </p>
              </div>
              <Switch />
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
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Tägliche Zusammenfassung</Label>
                <p className="text-sm text-muted-foreground">
                  Tägliche Performance-Zusammenfassungen erhalten
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Trade-Benachrichtigungen</Label>
                <p className="text-sm text-muted-foreground">
                  Benachrichtigt werden, wenn Trades importiert werden
                </p>
              </div>
              <Switch defaultChecked />
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Standardwährung</Label>
                <p className="text-sm text-muted-foreground">
                  Währung für P&L-Anzeige
                </p>
              </div>
              <Select defaultValue="usd">
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD ($)</SelectItem>
                  <SelectItem value="eur">EUR (€)</SelectItem>
                  <SelectItem value="gbp">GBP (£)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <Label>Zeitzone</Label>
                <p className="text-sm text-muted-foreground">
                  Deine lokale Trading-Zeitzone
                </p>
              </div>
              <Select defaultValue="est">
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="est">Eastern (EST)</SelectItem>
                  <SelectItem value="cst">Central (CST)</SelectItem>
                  <SelectItem value="pst">Pacific (PST)</SelectItem>
                  <SelectItem value="utc">UTC</SelectItem>
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
              onCredentialsSave={(token, queryId) => {
                console.log("IB credentials saved:", { queryId, tokenLength: token.length });
                toast.success("IB-Einstellungen gespeichert");
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
              <Input id="current-password" type="password" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">Neues Passwort</Label>
                <Input id="new-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Passwort bestätigen</Label>
                <Input id="confirm-password" type="password" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" />
          Änderungen speichern
        </Button>
      </div>
    </div>
  );
}
