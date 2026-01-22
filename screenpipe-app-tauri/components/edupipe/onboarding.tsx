"use client";

import React, { useState } from "react";
import { useEduPipeSettings } from "@/lib/edupipe/use-edupipe-settings";
import { useCanvas } from "@/lib/edupipe/use-canvas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  GraduationCap,
  BookOpen,
  Microscope,
  Briefcase,
  Heart,
  ChevronRight,
  ChevronLeft,
  Check,
  Link,
  Shield,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { StudentPersona } from "@/lib/edupipe/types";

type OnboardingStep = "welcome" | "persona" | "canvas" | "privacy" | "complete";

const STEPS: OnboardingStep[] = ["welcome", "persona", "canvas", "privacy", "complete"];

const PERSONA_OPTIONS: Array<{
  id: StudentPersona;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "undergraduate",
    title: "Undergraduate",
    description: "Working toward a bachelor's degree",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    id: "graduate",
    title: "Graduate Student",
    description: "Pursuing a master's or doctoral degree",
    icon: <GraduationCap className="h-5 w-5" />,
  },
  {
    id: "researcher",
    title: "Researcher",
    description: "Conducting academic research",
    icon: <Microscope className="h-5 w-5" />,
  },
  {
    id: "professional",
    title: "Professional",
    description: "Continuing education for career growth",
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    id: "lifelong-learner",
    title: "Lifelong Learner",
    description: "Learning for personal enrichment",
    icon: <Heart className="h-5 w-5" />,
  },
];

export function EduPipeOnboarding() {
  const { settings, updateProfile, updateSettings, completeEduPipeOnboarding } = useEduPipeSettings();
  const { connect, isConnecting, connectionError, isConnected } = useCanvas();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [selectedPersona, setSelectedPersona] = useState<StudentPersona>(settings.profile.persona);
  const [major, setMajor] = useState(settings.profile.major || "");
  const [institution, setInstitution] = useState(settings.profile.institution || "");
  const [canvasDomain, setCanvasDomain] = useState("");
  const [canvasToken, setCanvasToken] = useState("");
  const [privacySettings, setPrivacySettings] = useState({
    monitoringEnabled: true,
    cloudAiEnabled: true,
    syncGrades: true,
    syncFiles: true,
  });

  const stepIndex = STEPS.indexOf(currentStep);
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100;

  const goNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleCanvasConnect = async () => {
    if (!canvasDomain || !canvasToken) return;
    const success = await connect(canvasDomain, canvasToken);
    if (success) {
      setCanvasToken(""); // Clear for security
      goNext();
    }
  };

  const handleComplete = async () => {
    // Save profile
    await updateProfile({
      persona: selectedPersona,
      major: major || undefined,
      institution: institution || undefined,
    });

    // Save privacy settings
    await updateSettings({
      privacy: {
        ...settings.privacy,
        ...privacySettings,
      },
    });

    // Complete onboarding
    await completeEduPipeOnboarding();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress */}
      <div className="h-1">
        <Progress value={progressPercent} className="h-full rounded-none" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          {/* Welcome Step */}
          {currentStep === "welcome" && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
                <GraduationCap className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold">Welcome to EduPipe</h1>
                <p className="text-muted-foreground text-lg">
                  Your AI-powered educational companion
                </p>
              </div>
              <div className="space-y-4 text-left bg-muted/50 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Intelligent Study Assistant</p>
                    <p className="text-sm text-muted-foreground">
                      Get help with assignments, concepts, and study planning
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Link className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Canvas Integration</p>
                    <p className="text-sm text-muted-foreground">
                      Sync your courses, assignments, and deadlines
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Privacy-First</p>
                    <p className="text-sm text-muted-foreground">
                      Your data stays local and under your control
                    </p>
                  </div>
                </div>
              </div>
              <Button size="lg" onClick={goNext} className="gap-2">
                Get Started
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Persona Step */}
          {currentStep === "persona" && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Tell us about yourself</h2>
                <p className="text-muted-foreground">
                  This helps us personalize your learning experience
                </p>
              </div>

              <div className="space-y-4">
                <Label>I am a...</Label>
                <RadioGroup
                  value={selectedPersona}
                  onValueChange={(v) => setSelectedPersona(v as StudentPersona)}
                  className="space-y-2"
                >
                  {PERSONA_OPTIONS.map((option) => (
                    <div
                      key={option.id}
                      className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedPersona === option.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedPersona(option.id)}
                    >
                      <RadioGroupItem value={option.id} id={option.id} />
                      <div className="p-2 rounded-lg bg-muted">
                        {option.icon}
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={option.id} className="font-medium cursor-pointer">
                          {option.title}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="major">Major/Field (optional)</Label>
                  <Input
                    id="major"
                    placeholder="e.g., Computer Science"
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="institution">Institution (optional)</Label>
                  <Input
                    id="institution"
                    placeholder="e.g., State University"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={goBack} className="gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={goNext} className="gap-2">
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Canvas Step */}
          {currentStep === "canvas" && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Connect Canvas LMS</h2>
                <p className="text-muted-foreground">
                  Sync your courses, assignments, and grades
                </p>
              </div>

              {isConnected ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 mx-auto flex items-center justify-center">
                    <Check className="h-8 w-8 text-green-500" />
                  </div>
                  <p className="text-lg font-medium">Canvas Connected!</p>
                  <p className="text-muted-foreground">
                    Your courses and assignments are now syncing
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="canvas-domain">Canvas Domain</Label>
                    <Input
                      id="canvas-domain"
                      placeholder="canvas.university.edu"
                      value={canvasDomain}
                      onChange={(e) => setCanvasDomain(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="canvas-token">Access Token</Label>
                    <Input
                      id="canvas-token"
                      type="password"
                      placeholder="Enter your Canvas access token"
                      value={canvasToken}
                      onChange={(e) => setCanvasToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Generate in Canvas: Account → Settings → New Access Token
                    </p>
                  </div>

                  {connectionError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {connectionError}
                    </div>
                  )}

                  <Button
                    onClick={handleCanvasConnect}
                    disabled={!canvasDomain || !canvasToken || isConnecting}
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
                        Connect Canvas
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={goBack} className="gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={goNext} variant={isConnected ? "default" : "outline"} className="gap-2">
                  {isConnected ? "Continue" : "Skip for now"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Privacy Step */}
          {currentStep === "privacy" && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Privacy Settings</h2>
                <p className="text-muted-foreground">
                  Control how EduPipe works with your data
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-4 rounded-lg border">
                  <Checkbox
                    id="monitoring"
                    checked={privacySettings.monitoringEnabled}
                    onCheckedChange={(checked) =>
                      setPrivacySettings((p) => ({ ...p, monitoringEnabled: checked === true }))
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="monitoring" className="font-medium cursor-pointer">
                      Enable Learning Monitoring
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Track your study time and identify when you're using educational apps
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-4 rounded-lg border">
                  <Checkbox
                    id="cloud-ai"
                    checked={privacySettings.cloudAiEnabled}
                    onCheckedChange={(checked) =>
                      setPrivacySettings((p) => ({ ...p, cloudAiEnabled: checked === true }))
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="cloud-ai" className="font-medium cursor-pointer">
                      Use Cloud AI
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Enable smarter responses using cloud-based AI models
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-4 rounded-lg border">
                  <Checkbox
                    id="sync-grades"
                    checked={privacySettings.syncGrades}
                    onCheckedChange={(checked) =>
                      setPrivacySettings((p) => ({ ...p, syncGrades: checked === true }))
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="sync-grades" className="font-medium cursor-pointer">
                      Sync Grades & Feedback
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Import grades from Canvas to identify areas for improvement
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-4 rounded-lg border">
                  <Checkbox
                    id="sync-files"
                    checked={privacySettings.syncFiles}
                    onCheckedChange={(checked) =>
                      setPrivacySettings((p) => ({ ...p, syncFiles: checked === true }))
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="sync-files" className="font-medium cursor-pointer">
                      Index Course Materials
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Download and index PDFs and documents from Canvas
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Your data is stored locally and never shared without your permission.
                    You can change these settings anytime.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={goBack} className="gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={goNext} className="gap-2">
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === "complete" && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-green-500/10 mx-auto flex items-center justify-center">
                <Check className="h-10 w-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">You're All Set!</h2>
                <p className="text-muted-foreground">
                  EduPipe is ready to help you learn smarter
                </p>
              </div>

              <div className="text-left bg-muted/50 rounded-lg p-6 space-y-3">
                <p className="font-medium">What's next:</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Explore your Learning Hub dashboard
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Start a Focus Mode session for deep work
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Ask the AI tutor about your coursework
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Review your learning timeline
                  </li>
                </ul>
              </div>

              <Button size="lg" onClick={handleComplete} className="gap-2">
                Start Learning
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EduPipeOnboarding;
