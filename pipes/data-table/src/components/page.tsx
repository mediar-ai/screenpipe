"use client";

import { useEffect, useState } from "react";
import { DatabaseSidebar } from "./database-sidebar";
import { OcrDataTable } from "./ocr-data-table";
import { VideoChunksTable } from "./video-chunks-table";
import { AudioTranscriptionsTable } from "./audio-transcriptions-table";
import { UiMonitoringTable } from "./ui-monitoring-table";
import { pipe } from "@screenpipe/browser";

export default function DataPage() {
  const [currentTable, setCurrentTable] = useState("ocr_text");

  useEffect(() => {
    pipe.captureMainFeatureEvent("data-table");
  }, []);

  const renderTable = () => {
    switch (currentTable) {
      case "ocr_text":
        return <OcrDataTable />;
      case "video_chunks":
        return <VideoChunksTable />;
      case "audio_transcriptions":
        return <AudioTranscriptionsTable />;
      case "ui_monitoring":
        return navigator.userAgent.toLowerCase().includes("mac") ? (
          <UiMonitoringTable />
        ) : (
          <div></div>
        );
      default:
        return <div>select a table</div>;
    }
  };

  return (
    <div className="flex h-screen w-full">
      <div className="w-[20%]">
        <DatabaseSidebar
          currentTable={currentTable}
          onTableSelect={setCurrentTable}
        />
      </div>
      <div className="w-[80%] p-8">
        <div className="w-full">{renderTable()}</div>
      </div>
    </div>
  );
}
