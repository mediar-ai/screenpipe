"use client"
import React, { useState } from "react";
import DialogSettings from "./dialog-setting";
import { Button } from '@/components/ui/button';
import { SettingsIcon } from "lucide-react";

export default function Header() {
  const [isDialogSettingOpen, setIsDialogSettingOpen] = useState(false);
  return (
    <div className="flex relative flex-col justify-center items-center mt-16">
      <Button
        variant="outline"
        onClick={() => setIsDialogSettingOpen(true)}
        className="absolute right-10 top-[-25px]"
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>
      <DialogSettings 
        open={isDialogSettingOpen}
        onOpenChange={setIsDialogSettingOpen}
      />
      <img
        className="w-24 h-24"
        src="/128x128.png"
        alt="screenpipe-logo"
      />
      <h1 className="font-bold text-center text-2xl">screenpipe</h1>
    </div>
  );
}
