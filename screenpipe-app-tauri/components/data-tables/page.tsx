"use client"

import { useState } from "react"
import { DatabaseSidebar } from "@/components/data-tables/database-sidebar"
import { OcrDataTable } from "@/components/data-tables/ocr-data-table"
import { VideoChunksTable } from "@/components/data-tables/video-chunks-table"
import { AudioTranscriptionsTable } from "@/components/data-tables/audio-transcriptions-table"

export default function DataPage() {
  const [currentTable, setCurrentTable] = useState("ocr_text")

  const renderTable = () => {
    switch (currentTable) {
      case "ocr_text":
        return <OcrDataTable />
      case "video_chunks":
        return <VideoChunksTable />
      case "audio_transcriptions":
        return <AudioTranscriptionsTable />
      default:
        return <div>select a table</div>
    }
  }

  return (
    <div className="flex h-screen w-full">
      <div className="w-[20%]">
        <DatabaseSidebar 
          currentTable={currentTable} 
          onTableSelect={setCurrentTable} 
        />
      </div>
      <div className="w-[80%] p-8">
        <div className="w-full">
          {renderTable()}
        </div>
      </div>
    </div>
  )
}