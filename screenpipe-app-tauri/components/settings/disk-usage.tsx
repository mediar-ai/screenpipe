"use client";
import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface DiskUsageData {
  pipes: [string, string][];
  total_data_size: string;
  total_pipes_size: string;
  total_video_size: string;
  total_audio_size: string;
}

export default function DiskUsage() {
  const [diskUsage, setDiskUsage] = useState<DiskUsageData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const getDisk = async () => {
    setLoading(true);
    try {
      await invoke<DiskUsageData>("get_disk_usage").then((result) => {
        return new Promise<DiskUsageData>((resolve) => {
          setTimeout(() => resolve(result), 2000);
        });
      }).then((result) => {
        console.log("DISK USAGE:", result);
        setDiskUsage(result);
        setLoading(false);
      })
    } catch (error) {
      console.error("Failed to fetch disk usage:", error);
      toast({
        title: "error",
        description: "failed to fetch disk usage, please try again!",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    getDisk();
  }, []);

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">disk usage
        {loading && !diskUsage ? 
          <span className="text-sm ml-2 !font-normal text-muted-foreground">loading...</span>
          : ""}
      </h1>
      <div className="flex flex-col items-center justify-center space-y-4">
        {diskUsage && diskUsage.pipes && (
          <Accordion type="single" collapsible 
            className="w-[90%] border rounded-lg">
            <AccordionItem value="total-pipes-size">
              <AccordionTrigger className="mx-4 h-[80px] hover:no-underline">
                <div className="w-full flex items-center justify-between">
                  <span className="font-semibold">disk used by pipes:<span></span></span>
                  <Badge variant={"outline"} className="mr-4 font-semibold min-w-[5.5rem]">{diskUsage.total_pipes_size}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="w-full">
                {diskUsage.pipes.map(([name, size], index) => (
                  <div key={index} className="flex items-center justify-between px-1 py-1">
                    <span className="text-base ml-8">{name}</span>
                    <Badge variant={"outline"} className="mr-10 min-w-[5.5rem] text-center">{size}</Badge>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {diskUsage && diskUsage.total_data_size && (
          <Accordion type="single" collapsible 
            className="w-[90%] border rounded-lg">
            <AccordionItem value="total-pipes-size">
              <AccordionTrigger className="mx-4 h-[80px] hover:no-underline">
                <div className="w-full flex items-center justify-between">
                  <span className="font-semibold">total spaced used by screenpipe data:</span>
                  <Badge variant={"outline"} className="mr-4 font-semibold min-w-[5.5rem]">{diskUsage.total_data_size}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="w-full">
                <div key={"video"} className="flex items-center justify-between px-1 py-1">
                  <span className="text-base ml-8">video data</span>
                  <Badge variant={"outline"} className="mr-10 min-w-[5.5rem] text-center">{diskUsage.total_video_size}</Badge>
                </div>
                <div key={"audio"} className="flex items-center justify-between px-1 py-1">
                  <span className="text-base ml-8">audio data</span>
                  <Badge variant={"outline"} className="mr-10 min-w-[5.5rem] text-center">{diskUsage.total_audio_size}</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  );
}

