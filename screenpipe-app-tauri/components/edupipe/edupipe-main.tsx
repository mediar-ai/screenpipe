"use client";

import React, { useState, useEffect } from "react";
import { useEduPipeSettings } from "@/lib/edupipe/use-edupipe-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Clock,
  MessageSquare,
  Settings,
  Timer,
  Menu,
} from "lucide-react";

// Import EduPipe components
import { LearningHub } from "./learning-hub";
import { FocusMode } from "./focus-mode";
import { LearningStream } from "./learning-stream";
import { LearnChat } from "./learn-chat";
import { EduPipeOnboarding } from "./onboarding";
import { EduPipeSettingsPanel } from "./settings-panel";

type EduPipeTab = "dashboard" | "courses" | "timeline" | "chat" | "focus";

interface EduPipeMainProps {
  initialTab?: EduPipeTab;
}

export function EduPipeMain({ initialTab = "dashboard" }: EduPipeMainProps) {
  const { settings, isLoaded, isOnboardingComplete } = useEduPipeSettings();
  const [activeTab, setActiveTab] = useState<EduPipeTab>(initialTab);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Show onboarding if not completed
  if (isLoaded && !isOnboardingComplete) {
    return <EduPipeOnboarding />;
  }

  // Show loading state
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <GraduationCap className="h-12 w-12 mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading EduPipe...</p>
        </div>
      </div>
    );
  }

  // Show Focus Mode as overlay
  if (showFocusMode) {
    return <FocusMode onClose={() => setShowFocusMode(false)} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          {/* Mobile menu */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  EduPipe
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 mt-4">
                {[
                  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
                  { id: "timeline", label: "Timeline", icon: Clock },
                  { id: "chat", label: "Chat", icon: MessageSquare },
                ].map((item) => (
                  <Button
                    key={item.id}
                    variant={activeTab === item.id ? "secondary" : "ghost"}
                    className="justify-start gap-2"
                    onClick={() => {
                      setActiveTab(item.id as EduPipeTab);
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            <span className="font-semibold hidden sm:inline">EduPipe</span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EduPipeTab)}>
            <TabsList>
              <TabsTrigger value="dashboard" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden lg:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-2">
                <Clock className="h-4 w-4" />
                <span className="hidden lg:inline">Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden lg:inline">Chat</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="gap-2"
            onClick={() => setShowFocusMode(true)}
          >
            <Timer className="h-4 w-4" />
            <span className="hidden sm:inline">Focus</span>
          </Button>
          <Sheet open={showSettings} onOpenChange={setShowSettings}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>EduPipe Settings</SheetTitle>
                <SheetDescription>
                  Configure your learning companion
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <EduPipeSettingsPanel />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EduPipeTab)} className="h-full">
          <TabsContent value="dashboard" className="h-full m-0 overflow-auto p-6">
            <LearningHub
              onOpenFocusMode={() => setShowFocusMode(true)}
              onOpenSettings={() => setShowSettings(true)}
            />
          </TabsContent>

          <TabsContent value="timeline" className="h-full m-0">
            <LearningStream />
          </TabsContent>

          <TabsContent value="chat" className="h-full m-0">
            <LearnChat />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default EduPipeMain;
