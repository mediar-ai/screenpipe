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
  media: {
    audios_size: string;
    videos_size: string;
    total_media_size: string;
  };
  pipes: {
    pipes: [string, string][];
    total_pipes_size: string;
  };
  total_data_size: string;
  avaiable_space: string;
}

export default function DiskUsage() {
  const [diskUsage, setDiskUsage] = useState<DiskUsageData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const getDisk = async () => {
    setLoading(true);
    try {
      await invoke<DiskUsageData>("get_disk_usage").then((result) => {
        return new Promise<DiskUsageData>((resolve) => {
          setTimeout(() => resolve(result), 3000);
        });
      }).then((result) => {
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
                  <div className="flex flex-col !float-left items-start">
                    <span className="font-semibold">disk used by pipes</span>
                    <span className="text-[14px] !font-normal text-muted-foreground">total space used by installed pipes</span>
                  </div>
                  <Badge 
                    variant={"outline"} 
                    className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.pipes.total_pipes_size}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="w-full">
                {diskUsage.pipes.pipes.map(([name, size], index) => (
                  <div key={index} className="flex items-center justify-between px-1 py-1">
                    <span className="text-base ml-8">{name}</span>
                    <Badge 
                      variant={"outline"}
                      className="mr-10 min-w-[5.5rem] flex flex-row justify-center">
                      {size}
                    </Badge>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {diskUsage && diskUsage.media && (
          <Accordion type="single" collapsible 
            className="w-[90%] border rounded-lg">
            <AccordionItem value="total-pipes-size">
              <AccordionTrigger className="mx-4 h-[80px] hover:no-underline">
                <div className="w-full flex items-center justify-between">
                  <div className="flex flex-col !float-left items-start">
                    <span className="font-semibold">total data captured</span>
                    <span className="text-[14px] !font-normal text-muted-foreground">
                      amount of data captured by screenpipe over the time
                    </span>
                  </div>
                  <Badge 
                    variant={"outline"} 
                    className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.media.total_media_size}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="w-full">
                <div key={"video"} className="flex items-center justify-between px-1 py-1">
                  <span className="text-base ml-8">video data</span>
                  <Badge 
                    variant={"outline"} 
                    className="mr-10 min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.media.videos_size}
                  </Badge>
                </div>
                <div key={"audio"} className="flex items-center justify-between px-1 py-1">
                  <span className="text-base ml-8">audio data</span>
                  <Badge 
                    variant={"outline"} 
                    className="mr-10 min-w-[5.5rem] flex flex-row justify-center ">
                    {diskUsage.media.audios_size}
                  </Badge>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {diskUsage && diskUsage.total_data_size && diskUsage.avaiable_space && (
          <Accordion type="single" 
            className="w-[90%] border rounded-lg">
            <AccordionItem value="total-pipes-size">
              <AccordionTrigger className="mx-4 h-[120px] flex-col flex hover:no-underline">
                <div className="w-full flex flex-row items-center justify-between">
                  <div className="flex flex-col !float-left items-start">
                    <span className="font-semibold">total space used by screenpipe</span>
                  </div>
                  <Badge 
                    variant={"outline"} 
                    className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.total_data_size}
                  </Badge>
                </div>
                  <div className="flex justify-center">
                    <div className="h-[1px] w-[250px] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
                    <div className="h-[1px] w-[250px] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
                  </div>
                <div className="w-full flex flex-row items-center justify-between">
                  <div className="flex flex-col !float-left items-start">
                    <span className="font-semibold">avaiable space left on your system</span>
                  </div>
                  <Badge 
                    variant={"outline"} 
                    className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center">
                    {diskUsage.avaiable_space}
                  </Badge>
                </div>
              </AccordionTrigger>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  );
}

