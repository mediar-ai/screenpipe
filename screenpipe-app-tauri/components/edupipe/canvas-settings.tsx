"use client";

import React, { useState } from "react";
import { useCanvas } from "@/lib/edupipe/use-canvas";
import { useEduPipeSettings } from "@/lib/edupipe/use-edupipe-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  GraduationCap,
  Link,
  Unlink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
  FileText,
  Award,
  Bell,
  ExternalLink,
  HelpCircle,
  Shield,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function CanvasSettings() {
  const {
    isConnected,
    isConnecting,
    connectionError,
    connect,
    disconnect,
    syncAll,
    syncState,
    courses,
    assignments,
    files,
    grades,
    lastSyncAt,
  } = useCanvas();

  const { settings, updateSettings } = useEduPipeSettings();

  const [domain, setDomain] = useState(settings.canvas.domain || "");
  const [accessToken, setAccessToken] = useState("");
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const handleConnect = async () => {
    if (!domain || !accessToken) return;

    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    const success = await connect(cleanDomain, accessToken);
    if (success) {
      setAccessToken(""); // Clear token from state for security
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setShowDisconnectDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Canvas LMS
          </CardTitle>
          <CardDescription>
            Connect your Canvas account to sync courses, assignments, and grades
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected ? (
            <>
              {/* Connected State */}
              <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-300">Connected</p>
                    <p className="text-sm text-muted-foreground">
                      {settings.canvas.domain}
                    </p>
                  </div>
                </div>
                <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Unlink className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Canvas?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove your Canvas connection and all synced data.
                        You can reconnect at any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDisconnect}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Sync Status */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Last Synced</p>
                    <p className="text-xs text-muted-foreground">
                      {lastSyncAt
                        ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })
                        : "Never"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncAll()}
                    disabled={syncState.isSyncing}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncState.isSyncing ? "animate-spin" : ""}`} />
                    {syncState.isSyncing ? "Syncing..." : "Sync Now"}
                  </Button>
                </div>

                {syncState.isSyncing && (
                  <div className="space-y-2">
                    <Progress value={syncState.syncProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">{syncState.syncStatus}</p>
                  </div>
                )}

                {syncState.error && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    {syncState.error}
                  </div>
                )}
              </div>

              {/* Data Summary */}
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <BookOpen className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-xl font-bold">{courses.length}</p>
                  <p className="text-xs text-muted-foreground">Courses</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <FileText className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-xl font-bold">{assignments.length}</p>
                  <p className="text-xs text-muted-foreground">Assignments</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <FileText className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-xl font-bold">{files.length}</p>
                  <p className="text-xs text-muted-foreground">Files</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <Award className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-xl font-bold">{grades.length}</p>
                  <p className="text-xs text-muted-foreground">Grades</p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Disconnected State - Connection Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="canvas-domain">Canvas Domain</Label>
                  <Input
                    id="canvas-domain"
                    placeholder="canvas.university.edu"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your school's Canvas domain (e.g., canvas.university.edu)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="canvas-token">Access Token</Label>
                  <Input
                    id="canvas-token"
                    type="password"
                    placeholder="Enter your Canvas access token"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Generate a token in Canvas: Account → Settings → New Access Token
                  </p>
                </div>

                {connectionError && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {connectionError}
                  </div>
                )}

                <Button
                  onClick={handleConnect}
                  disabled={!domain || !accessToken || isConnecting}
                  className="w-full gap-2"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4" />
                      Connect to Canvas
                    </>
                  )}
                </Button>
              </div>

              {/* Help Section */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="help">
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4" />
                      How to get your Canvas access token
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Log in to your Canvas account</li>
                      <li>Click on "Account" in the left sidebar</li>
                      <li>Click on "Settings"</li>
                      <li>Scroll down to "Approved Integrations"</li>
                      <li>Click "+ New Access Token"</li>
                      <li>Enter a purpose (e.g., "EduPipe")</li>
                      <li>Click "Generate Token"</li>
                      <li>Copy the token and paste it above</li>
                    </ol>
                    <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-amber-500 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-700 dark:text-amber-300">
                            Security Note
                          </p>
                          <p className="text-muted-foreground">
                            Your access token is stored locally and never shared.
                            You can revoke it anytime from Canvas settings.
                          </p>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sync Settings */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Settings</CardTitle>
            <CardDescription>
              Control what data is synced from Canvas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sync Grades</Label>
                <p className="text-xs text-muted-foreground">
                  Fetch your grades and feedback
                </p>
              </div>
              <Switch
                checked={settings.privacy.syncGrades}
                onCheckedChange={(checked) =>
                  updateSettings({
                    privacy: { ...settings.privacy, syncGrades: checked },
                  })
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sync Files</Label>
                <p className="text-xs text-muted-foreground">
                  Download and index course materials
                </p>
              </div>
              <Switch
                checked={settings.privacy.syncFiles}
                onCheckedChange={(checked) =>
                  updateSettings({
                    privacy: { ...settings.privacy, syncFiles: checked },
                  })
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sync Feedback</Label>
                <p className="text-xs text-muted-foreground">
                  Fetch instructor feedback and comments
                </p>
              </div>
              <Switch
                checked={settings.privacy.syncFeedback}
                onCheckedChange={(checked) =>
                  updateSettings({
                    privacy: { ...settings.privacy, syncFeedback: checked },
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CanvasSettings;
