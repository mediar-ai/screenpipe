"use client";

import React, { useState } from "react";
import { useEduPipeSettings } from "@/lib/edupipe/use-edupipe-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  User,
  GraduationCap,
  Shield,
  Timer,
  Bell,
  Trash2,
  RotateCcw,
  Plus,
  X,
} from "lucide-react";

import { CanvasSettings } from "./canvas-settings";
import { StudentPersona } from "@/lib/edupipe/types";

const PERSONA_LABELS: Record<StudentPersona, string> = {
  undergraduate: "Undergraduate",
  graduate: "Graduate Student",
  researcher: "Researcher",
  professional: "Professional",
  "lifelong-learner": "Lifelong Learner",
};

export function EduPipeSettingsPanel() {
  const { settings, updateSettings, updateProfile, updatePrivacy, addPrivateApp, removePrivateApp, resetSettings } =
    useEduPipeSettings();

  const [newPrivateApp, setNewPrivateApp] = useState("");

  const handleAddPrivateApp = () => {
    if (newPrivateApp.trim()) {
      addPrivateApp(newPrivateApp.trim());
      setNewPrivateApp("");
    }
  };

  return (
    <div className="space-y-6">
      <Accordion type="single" collapsible className="w-full" defaultValue="canvas">
        {/* Canvas Settings */}
        <AccordionItem value="canvas">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Canvas LMS
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CanvasSettings />
          </AccordionContent>
        </AccordionItem>

        {/* Profile Settings */}
        <AccordionItem value="profile">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Student Profile
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <Label>Learning Persona</Label>
              <Select
                value={settings.profile.persona}
                onValueChange={(value) => updateProfile({ persona: value as StudentPersona })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERSONA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="major">Major/Field</Label>
                <Input
                  id="major"
                  value={settings.profile.major || ""}
                  onChange={(e) => updateProfile({ major: e.target.value || undefined })}
                  placeholder="e.g., Computer Science"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="institution">Institution</Label>
                <Input
                  id="institution"
                  value={settings.profile.institution || ""}
                  onChange={(e) => updateProfile({ institution: e.target.value || undefined })}
                  placeholder="e.g., State University"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Focus Mode Settings */}
        <AccordionItem value="focus">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Focus Mode
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Default Duration</Label>
                <span className="text-sm text-muted-foreground">
                  {settings.focusMode.defaultDurationMinutes} min
                </span>
              </div>
              <Slider
                value={[settings.focusMode.defaultDurationMinutes]}
                onValueChange={([value]) =>
                  updateSettings({
                    focusMode: { ...settings.focusMode, defaultDurationMinutes: value },
                  })
                }
                min={5}
                max={120}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Break Duration</Label>
                <span className="text-sm text-muted-foreground">
                  {settings.focusMode.breakDurationMinutes} min
                </span>
              </div>
              <Slider
                value={[settings.focusMode.breakDurationMinutes]}
                onValueChange={([value]) =>
                  updateSettings({
                    focusMode: { ...settings.focusMode, breakDurationMinutes: value },
                  })
                }
                min={1}
                max={30}
                step={1}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Distraction Alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Get notified when switching to non-educational apps
                </p>
              </div>
              <Switch
                checked={settings.focusMode.distractionAlerts}
                onCheckedChange={(checked) =>
                  updateSettings({
                    focusMode: { ...settings.focusMode, distractionAlerts: checked },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sound Effects</Label>
                <p className="text-xs text-muted-foreground">
                  Play sounds for session events
                </p>
              </div>
              <Switch
                checked={settings.focusMode.soundEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({
                    focusMode: { ...settings.focusMode, soundEnabled: checked },
                  })
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Agent Settings */}
        <AccordionItem value="agent">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              AI Assistant
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable AI Assistant</Label>
                <p className="text-xs text-muted-foreground">
                  Get intelligent help with your studies
                </p>
              </div>
              <Switch
                checked={settings.agent.enabled}
                onCheckedChange={(checked) =>
                  updateSettings({
                    agent: { ...settings.agent, enabled: checked },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Proactive Help</Label>
                <p className="text-xs text-muted-foreground">
                  Offer help when you seem stuck
                </p>
              </div>
              <Switch
                checked={settings.agent.proactiveHelp}
                onCheckedChange={(checked) =>
                  updateSettings({
                    agent: { ...settings.agent, proactiveHelp: checked },
                  })
                }
                disabled={!settings.agent.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Deadline Reminders</Label>
                <p className="text-xs text-muted-foreground">
                  Get notified about upcoming assignments
                </p>
              </div>
              <Switch
                checked={settings.agent.deadlineReminders}
                onCheckedChange={(checked) =>
                  updateSettings({
                    agent: { ...settings.agent, deadlineReminders: checked },
                  })
                }
                disabled={!settings.agent.enabled}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Reminder Lead Time</Label>
                <span className="text-sm text-muted-foreground">
                  {settings.agent.reminderLeadTimeDays} days
                </span>
              </div>
              <Slider
                value={[settings.agent.reminderLeadTimeDays]}
                onValueChange={([value]) =>
                  updateSettings({
                    agent: { ...settings.agent, reminderLeadTimeDays: value },
                  })
                }
                min={1}
                max={7}
                step={1}
                disabled={!settings.agent.enabled || !settings.agent.deadlineReminders}
              />
            </div>

            <div className="space-y-2">
              <Label>Notification Frequency</Label>
              <Select
                value={settings.agent.notificationFrequency}
                onValueChange={(value) =>
                  updateSettings({
                    agent: {
                      ...settings.agent,
                      notificationFrequency: value as "minimal" | "moderate" | "frequent",
                    },
                  })
                }
                disabled={!settings.agent.enabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="frequent">Frequent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Privacy Settings */}
        <AccordionItem value="privacy">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Privacy
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Learning Monitoring</Label>
                <p className="text-xs text-muted-foreground">
                  Track screen activity for study insights
                </p>
              </div>
              <Switch
                checked={settings.privacy.monitoringEnabled}
                onCheckedChange={(checked) =>
                  updatePrivacy({ monitoringEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Cloud AI</Label>
                <p className="text-xs text-muted-foreground">
                  Use cloud-based AI for better responses
                </p>
              </div>
              <Switch
                checked={settings.privacy.cloudAiEnabled}
                onCheckedChange={(checked) =>
                  updatePrivacy({ cloudAiEnabled: checked })
                }
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Private Apps</Label>
              <p className="text-xs text-muted-foreground">
                Apps that will never be monitored
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {settings.privacy.privateApps.map((app) => (
                  <Badge key={app} variant="secondary" className="gap-1">
                    {app}
                    <button
                      onClick={() => removePrivateApp(app)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newPrivateApp}
                  onChange={(e) => setNewPrivateApp(e.target.value)}
                  placeholder="App name"
                  onKeyDown={(e) => e.key === "Enter" && handleAddPrivateApp()}
                />
                <Button size="icon" onClick={handleAddPrivateApp}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Data Retention</Label>
              <Select
                value={settings.privacy.retentionPeriod}
                onValueChange={(value) =>
                  updatePrivacy({
                    retentionPeriod: value as typeof settings.privacy.retentionPeriod,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-week">1 Week</SelectItem>
                  <SelectItem value="1-month">1 Month</SelectItem>
                  <SelectItem value="3-months">3 Months</SelectItem>
                  <SelectItem value="6-months">6 Months</SelectItem>
                  <SelectItem value="1-year">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-delete Old Data</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically remove data older than retention period
                </p>
              </div>
              <Switch
                checked={settings.privacy.autoDeleteEnabled}
                onCheckedChange={(checked) =>
                  updatePrivacy({ autoDeleteEnabled: checked })
                }
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive">
                <RotateCcw className="h-4 w-4" />
                Reset EduPipe Settings
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset All Settings?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all EduPipe settings to their defaults. Your Canvas connection
                  and synced data will be removed. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetSettings} className="bg-destructive text-destructive-foreground">
                  Reset Settings
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

export default EduPipeSettingsPanel;
