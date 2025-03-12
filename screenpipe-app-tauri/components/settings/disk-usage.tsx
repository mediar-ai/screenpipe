"use client";
import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import localforage from "localforage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  total_cache_size: string;
  avaiable_space: string;
}

const BadgeItem = ({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) => (
  <div className="flex flex-row items-center justify-between">
    <div className="flex flex-col !float-left items-start">
      <span className="font-semibold">{label}</span>
      <span className="text-[14px] !font-normal text-muted-foreground">
        {description}
      </span>
    </div>
    <Badge
      variant={"outline"}
      className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center"
    >
      {value}
    </Badge>
  </div>
);

const Divider = () => (
  <div className="flex my-2 justify-center">
    <div className="h-[1px] w-[250px] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
    <div className="h-[1px] w-[250px] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
  </div>
);

export default function DiskUsage() {
  const [diskUsage, setDiskUsage] = useState<DiskUsageData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const getDisk = async () => {
    setLoading(true);
    try {
      // const cachedData = await localforage.getItem<{
      //   diskData: DiskUsageData;
      //   lastUpdated: number;
      // }>("diskUsage");
      const now = Date.now();
      const twoDaysInMillis = 2 * 24 * 60 * 60 * 1000;
      // if (cachedData && now - cachedData.lastUpdated < twoDaysInMillis) {
      //   setDiskUsage(cachedData.diskData);
      //   setLoading(false);
      // } else {
      const result = await invoke<DiskUsageData>("get_disk_usage");
      console.log("result", result);
      // await new Promise<DiskUsageData>((resolve) => {
      //   setTimeout(() => resolve(result), 3000);
      // });
      // await localforage.setItem("diskUsage", {
      //   diskData: result,
      //   lastUpdated: now,
      // });
      setDiskUsage(result);
      setLoading(false);
      // }
    } catch (error) {
      console.error("Failed to fetch disk usage:", error);
      toast({
        title: "error",
        description: "failed to fetch disk usage, please try again!",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    getDisk();
  }, []);

  return (
    <div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">
        disk usage
        {loading && !diskUsage ? (
          <span className="text-sm ml-2 !font-normal text-muted-foreground">
            loading...
          </span>
        ) : (
          ""
        )}
      </h1>
      <div className="flex flex-col items-center justify-center space-y-4">
        {loading && !diskUsage ? (
          <div className="w-full space-y-4">
            <Skeleton className="h-[80px] w-[90%] mx-auto" />
            <Skeleton className="h-[80px] w-[90%] mx-auto" />
            <Skeleton className="h-[200px] w-[90%] mx-auto" />
          </div>
        ) : (
          ""
        )}
        {diskUsage && diskUsage.pipes && (
          <Accordion
            type="single"
            collapsible
            className="w-[90%] border rounded-lg"
          >
            <AccordionItem value="total-pipes-size">
              <AccordionTrigger className="mx-4 h-[80px] hover:no-underline">
                <div className="w-full flex items-center justify-between">
                  <div className="flex flex-col !float-left items-start">
                    <span className="font-semibold">disk used by pipes</span>
                    <span className="text-[14px] !font-normal text-muted-foreground">
                      total space used by installed pipes
                    </span>
                  </div>
                  <Badge
                    variant={"outline"}
                    className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center"
                  >
                    {diskUsage.pipes.total_pipes_size}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="w-full">
                {diskUsage.pipes.pipes.map(([name, size], index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-1 py-1"
                  >
                    <span className="text-base ml-8">{name}</span>
                    <Badge
                      variant={"outline"}
                      className="mr-10 min-w-[5.5rem] flex flex-row justify-center"
                    >
                      {size}
                    </Badge>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {diskUsage && diskUsage.media && (
          <Accordion
            type="single"
            collapsible
            className="w-[90%] border rounded-lg"
          >
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
                    className="mr-4 font-semibold min-w-[5.5rem] flex flex-row justify-center"
                  >
                    {diskUsage.media.total_media_size}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="w-full">
                <div
                  key={"video"}
                  className="flex items-center justify-between px-1 py-1"
                >
                  <span className="text-base ml-8">video data</span>
                  <Badge
                    variant={"outline"}
                    className="mr-10 min-w-[5.5rem] flex flex-row justify-center"
                  >
                    {diskUsage.media.videos_size}
                  </Badge>
                </div>
                <div
                  key={"audio"}
                  className="flex items-center justify-between px-1 py-1"
                >
                  <span className="text-base ml-8">audio data</span>
                  <Badge
                    variant={"outline"}
                    className="mr-10 min-w-[5.5rem] flex flex-row justify-center "
                  >
                    {diskUsage.media.audios_size}
                  </Badge>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {diskUsage && diskUsage.total_data_size && diskUsage.avaiable_space && (
          <div className="w-[90%] border rounded-lg p-8">
            <div className="w-full space-y-6">
              <BadgeItem
                label="screenpipe cache size"
                description="disk space used for models, frames..."
                value={diskUsage.total_cache_size}
              />
              <Divider />
              <BadgeItem
                label="disk space used by screenpipe"
                description="total disk space utilized by the screenpipe application"
                value={diskUsage.total_data_size}
              />
              <Divider />
              <BadgeItem
                label="available disk space"
                description="remaining free disk space on your device"
                value={diskUsage.avaiable_space}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
