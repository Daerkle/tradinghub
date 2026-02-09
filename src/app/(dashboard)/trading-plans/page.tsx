"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  Circle,
  Clock,
  Calendar,
  Shield,
  Target,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  BarChart3,
  Settings,
  Copy,
  MoreHorizontal,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { TradingPlanData, TradingPlanService } from "@/lib/models";
import { toast } from "sonner";

const defaultPlan: Omit<TradingPlanData, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  description: "",
  isActive: false,
  maxDailyLoss: 500,
  maxDailyTrades: 5,
  maxPositionSize: 10000,
  riskPerTrade: 1,
  entryRules: [],
  exitRules: [],
  stopLossRules: [],
  tradingHoursStart: "09:30",
  tradingHoursEnd: "16:00",
  tradingDays: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"],
  preferredSetups: [],
  avoidConditions: [],
  dailyProfitTarget: 500,
  weeklyProfitTarget: 2000,
  monthlyProfitTarget: 8000,
};

const weekDays = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];

export default function TradingPlansPage() {
  const [plans, setPlans] = useState<TradingPlanData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TradingPlanData | null>(null);
  const [editingPlan, setEditingPlan] = useState<Omit<TradingPlanData, "id" | "createdAt" | "updatedAt">>(defaultPlan);
  const [newRule, setNewRule] = useState({ entry: "", exit: "", stopLoss: "" });
  const [newSetup, setNewSetup] = useState("");
  const [newAvoid, setNewAvoid] = useState("");

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const data = await TradingPlanService.getAll();
      setPlans(data);
    } catch (error) {
      console.error("Error loading plans:", error);
      toast.error("Fehler beim Laden der Trading-Pläne");
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = () => {
    setSelectedPlan(null);
    setEditingPlan(defaultPlan);
    setDialogOpen(true);
  };

  const handleEdit = (plan: TradingPlanData) => {
    setSelectedPlan(plan);
    setEditingPlan({
      name: plan.name,
      description: plan.description,
      isActive: plan.isActive,
      maxDailyLoss: plan.maxDailyLoss,
      maxDailyTrades: plan.maxDailyTrades,
      maxPositionSize: plan.maxPositionSize,
      riskPerTrade: plan.riskPerTrade,
      entryRules: plan.entryRules,
      exitRules: plan.exitRules,
      stopLossRules: plan.stopLossRules,
      tradingHoursStart: plan.tradingHoursStart,
      tradingHoursEnd: plan.tradingHoursEnd,
      tradingDays: plan.tradingDays,
      preferredSetups: plan.preferredSetups,
      avoidConditions: plan.avoidConditions,
      dailyProfitTarget: plan.dailyProfitTarget,
      weeklyProfitTarget: plan.weeklyProfitTarget,
      monthlyProfitTarget: plan.monthlyProfitTarget,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingPlan.name.trim()) {
      toast.error("Bitte gib einen Namen für den Plan ein");
      return;
    }

    try {
      if (selectedPlan) {
        await TradingPlanService.update(selectedPlan.id, editingPlan);
        toast.success("Trading-Plan aktualisiert");
      } else {
        await TradingPlanService.create(editingPlan);
        toast.success("Trading-Plan erstellt");
      }
      setDialogOpen(false);
      loadPlans();
    } catch (error) {
      console.error("Error saving plan:", error);
      toast.error("Fehler beim Speichern des Plans");
    }
  };

  const handleDelete = async () => {
    if (!selectedPlan) return;

    try {
      await TradingPlanService.delete(selectedPlan.id);
      toast.success("Trading-Plan gelöscht");
      setDeleteDialogOpen(false);
      setSelectedPlan(null);
      loadPlans();
    } catch (error) {
      console.error("Error deleting plan:", error);
      toast.error("Fehler beim Löschen des Plans");
    }
  };

  const handleSetActive = async (plan: TradingPlanData) => {
    try {
      await TradingPlanService.setActive(plan.id);
      toast.success(`"${plan.name}" ist jetzt aktiv`);
      loadPlans();
    } catch (error) {
      console.error("Error setting active plan:", error);
      toast.error("Fehler beim Aktivieren des Plans");
    }
  };

  const handleDuplicate = async (plan: TradingPlanData) => {
    try {
      await TradingPlanService.create({
        ...plan,
        name: `${plan.name} (Kopie)`,
        isActive: false,
      });
      toast.success("Trading-Plan dupliziert");
      loadPlans();
    } catch (error) {
      console.error("Error duplicating plan:", error);
      toast.error("Fehler beim Duplizieren des Plans");
    }
  };

  const addRule = (type: "entry" | "exit" | "stopLoss") => {
    const rule = newRule[type].trim();
    if (!rule) return;

    const key = type === "entry" ? "entryRules" : type === "exit" ? "exitRules" : "stopLossRules";
    setEditingPlan({
      ...editingPlan,
      [key]: [...editingPlan[key], rule],
    });
    setNewRule({ ...newRule, [type]: "" });
  };

  const removeRule = (type: "entry" | "exit" | "stopLoss", index: number) => {
    const key = type === "entry" ? "entryRules" : type === "exit" ? "exitRules" : "stopLossRules";
    setEditingPlan({
      ...editingPlan,
      [key]: editingPlan[key].filter((_, i) => i !== index),
    });
  };

  const addSetup = () => {
    if (!newSetup.trim()) return;
    setEditingPlan({
      ...editingPlan,
      preferredSetups: [...editingPlan.preferredSetups, newSetup.trim()],
    });
    setNewSetup("");
  };

  const removeSetup = (index: number) => {
    setEditingPlan({
      ...editingPlan,
      preferredSetups: editingPlan.preferredSetups.filter((_, i) => i !== index),
    });
  };

  const addAvoid = () => {
    if (!newAvoid.trim()) return;
    setEditingPlan({
      ...editingPlan,
      avoidConditions: [...editingPlan.avoidConditions, newAvoid.trim()],
    });
    setNewAvoid("");
  };

  const removeAvoid = (index: number) => {
    setEditingPlan({
      ...editingPlan,
      avoidConditions: editingPlan.avoidConditions.filter((_, i) => i !== index),
    });
  };

  const toggleDay = (day: string) => {
    if (editingPlan.tradingDays.includes(day)) {
      setEditingPlan({
        ...editingPlan,
        tradingDays: editingPlan.tradingDays.filter((d) => d !== day),
      });
    } else {
      setEditingPlan({
        ...editingPlan,
        tradingDays: [...editingPlan.tradingDays, day],
      });
    }
  };

  const activePlan = plans.find((p) => p.isActive);

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading-Pläne</h1>
          <p className="text-muted-foreground">
            Verwalte deine Trading-Strategien und Risikomanagement-Regeln
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Plan
        </Button>
      </div>

      {/* Active Plan Summary */}
      {activePlan && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Aktiver Plan: {activePlan.name}</CardTitle>
              </div>
              <Badge variant="default">Aktiv</Badge>
            </div>
            <CardDescription>{activePlan.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Max. Tagesverlust</p>
                <p className="text-lg font-semibold text-destructive">
                  -${activePlan.maxDailyLoss}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Max. Trades/Tag</p>
                <p className="text-lg font-semibold">{activePlan.maxDailyTrades}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Risiko/Trade</p>
                <p className="text-lg font-semibold">{activePlan.riskPerTrade}%</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Trading-Zeiten</p>
                <p className="text-lg font-semibold">
                  {activePlan.tradingHoursStart} - {activePlan.tradingHoursEnd}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={plan.isActive ? "border-primary/50 bg-primary/5" : ""}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {plan.isActive ? (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!plan.isActive && (
                      <DropdownMenuItem onClick={() => handleSetActive(plan)}>
                        <Play className="h-4 w-4 mr-2" />
                        Aktivieren
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleEdit(plan)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Bearbeiten
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicate(plan)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplizieren
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        setSelectedPlan(plan);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CardDescription className="line-clamp-2">
                {plan.description || "Keine Beschreibung"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span>Max. Verlust: ${plan.maxDailyLoss}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span>Risiko: {plan.riskPerTrade}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <span>Max. Trades: {plan.maxDailyTrades}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.tradingHoursStart} - {plan.tradingHoursEnd}</span>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-1">
                  {plan.preferredSetups.slice(0, 3).map((setup, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {setup}
                    </Badge>
                  ))}
                  {plan.preferredSetups.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{plan.preferredSetups.length - 3}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {plan.tradingDays.length} Tage/Woche
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Empty State / Add New */}
        {plans.length === 0 && (
          <Card className="border-dashed col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Target className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Trading-Pläne</h3>
              <p className="text-muted-foreground text-center mb-4">
                Erstelle deinen ersten Trading-Plan, um deine Strategie zu dokumentieren
              </p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Plan erstellen
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPlan ? "Trading-Plan bearbeiten" : "Neuer Trading-Plan"}
            </DialogTitle>
            <DialogDescription>
              Definiere deine Trading-Regeln und Risikomanagement-Parameter
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general">Allgemein</TabsTrigger>
              <TabsTrigger value="risk">Risiko</TabsTrigger>
              <TabsTrigger value="rules">Regeln</TabsTrigger>
              <TabsTrigger value="schedule">Zeiten</TabsTrigger>
              <TabsTrigger value="targets">Ziele</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="z.B. Scalping-Strategie"
                  value={editingPlan.name}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  placeholder="Beschreibe deine Trading-Strategie..."
                  value={editingPlan.description}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Bevorzugte Setups</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="z.B. Breakout, Reversal"
                    value={newSetup}
                    onChange={(e) => setNewSetup(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSetup()}
                  />
                  <Button type="button" variant="outline" onClick={addSetup}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingPlan.preferredSetups.map((setup, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {setup}
                      <button onClick={() => removeSetup(i)} className="ml-1 hover:text-destructive">
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Zu vermeidende Bedingungen</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="z.B. Vor News-Events, Lunchzeit"
                    value={newAvoid}
                    onChange={(e) => setNewAvoid(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addAvoid()}
                  />
                  <Button type="button" variant="outline" onClick={addAvoid}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingPlan.avoidConditions.map((condition, i) => (
                    <Badge key={i} variant="destructive" className="gap-1">
                      {condition}
                      <button onClick={() => removeAvoid(i)} className="ml-1 hover:text-white">
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="risk" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxDailyLoss">Max. Tagesverlust ($)</Label>
                  <Input
                    id="maxDailyLoss"
                    type="number"
                    value={editingPlan.maxDailyLoss}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        maxDailyLoss: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDailyTrades">Max. Trades/Tag</Label>
                  <Input
                    id="maxDailyTrades"
                    type="number"
                    value={editingPlan.maxDailyTrades}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        maxDailyTrades: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxPositionSize">Max. Positionsgröße ($)</Label>
                  <Input
                    id="maxPositionSize"
                    type="number"
                    value={editingPlan.maxPositionSize}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        maxPositionSize: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="riskPerTrade">Risiko pro Trade (%)</Label>
                  <Input
                    id="riskPerTrade"
                    type="number"
                    step="0.1"
                    value={editingPlan.riskPerTrade}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        riskPerTrade: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rules" className="space-y-4 mt-4">
              {/* Entry Rules */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Einstiegsregeln
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="z.B. Nur bei Trend-Bestätigung einsteigen"
                    value={newRule.entry}
                    onChange={(e) => setNewRule({ ...newRule, entry: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && addRule("entry")}
                  />
                  <Button type="button" variant="outline" onClick={() => addRule("entry")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {editingPlan.entryRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                      <span className="flex-1">{rule}</span>
                      <button onClick={() => removeRule("entry", i)} className="hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exit Rules */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-500" />
                  Ausstiegsregeln
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="z.B. Take Profit bei 2R"
                    value={newRule.exit}
                    onChange={(e) => setNewRule({ ...newRule, exit: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && addRule("exit")}
                  />
                  <Button type="button" variant="outline" onClick={() => addRule("exit")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {editingPlan.exitRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                      <span className="flex-1">{rule}</span>
                      <button onClick={() => removeRule("exit", i)} className="hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stop Loss Rules */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Stop-Loss Regeln
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="z.B. Stop unter dem letzten Swing-Tief"
                    value={newRule.stopLoss}
                    onChange={(e) => setNewRule({ ...newRule, stopLoss: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && addRule("stopLoss")}
                  />
                  <Button type="button" variant="outline" onClick={() => addRule("stopLoss")}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {editingPlan.stopLossRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                      <span className="flex-1">{rule}</span>
                      <button onClick={() => removeRule("stopLoss", i)} className="hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tradingHoursStart">Trading Start</Label>
                  <Input
                    id="tradingHoursStart"
                    type="time"
                    value={editingPlan.tradingHoursStart}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        tradingHoursStart: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tradingHoursEnd">Trading Ende</Label>
                  <Input
                    id="tradingHoursEnd"
                    type="time"
                    value={editingPlan.tradingHoursEnd}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        tradingHoursEnd: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Trading-Tage</Label>
                <div className="flex flex-wrap gap-2">
                  {weekDays.map((day) => (
                    <Badge
                      key={day}
                      variant={editingPlan.tradingDays.includes(day) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleDay(day)}
                    >
                      {day}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="targets" className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dailyProfitTarget">Tagesziel ($)</Label>
                  <Input
                    id="dailyProfitTarget"
                    type="number"
                    value={editingPlan.dailyProfitTarget}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        dailyProfitTarget: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weeklyProfitTarget">Wochenziel ($)</Label>
                  <Input
                    id="weeklyProfitTarget"
                    type="number"
                    value={editingPlan.weeklyProfitTarget}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        weeklyProfitTarget: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthlyProfitTarget">Monatsziel ($)</Label>
                  <Input
                    id="monthlyProfitTarget"
                    type="number"
                    value={editingPlan.monthlyProfitTarget}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        monthlyProfitTarget: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave}>
              {selectedPlan ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trading-Plan löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Der Trading-Plan
              &quot;{selectedPlan?.name}&quot; wird permanent gelöscht.
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
