"use client"

import { useState } from "react"
import { DatabaseSidebar } from "@/components/user-data/database-sidebar"
import { OcrDataTable } from "@/components/user-data/ocr-data-table"
import { VideoChunksTable } from "@/components/user-data/video-chunks-table"
import { AudioTranscriptionsTable } from "@/components/user-data/audio-transcriptions-table"

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
    <div className="flex h-screen">
      <DatabaseSidebar 
        currentTable={currentTable} 
        onTableSelect={setCurrentTable} 
      />
      <div className="flex-1 p-8 max-w-[1200px] min-w-[1200px]">
        <div className="w-full">
          {renderTable()}
        </div>
      </div>
    </div>
  )
}