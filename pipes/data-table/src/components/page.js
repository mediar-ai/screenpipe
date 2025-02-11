"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DataPage;
const react_1 = require("react");
const database_sidebar_1 = require("./database-sidebar");
const ocr_data_table_1 = require("./ocr-data-table");
const video_chunks_table_1 = require("./video-chunks-table");
const audio_transcriptions_table_1 = require("./audio-transcriptions-table");
const ui_monitoring_table_1 = require("./ui-monitoring-table");
const browser_1 = require("@screenpipe/browser");
const search_command_1 = require("./search-command");
function DataPage() {
    const [currentTable, setCurrentTable] = (0, react_1.useState)("ocr_text");
    (0, react_1.useEffect)(() => {
        browser_1.pipe.captureMainFeatureEvent("data-table");
    }, []);
    const renderTable = () => {
        switch (currentTable) {
            case "ocr_text":
                return <ocr_data_table_1.OcrDataTable />;
            case "video_chunks":
                return <video_chunks_table_1.VideoChunksTable />;
            case "audio_transcriptions":
                return <audio_transcriptions_table_1.AudioTranscriptionsTable />;
            case "ui_monitoring":
                return navigator.userAgent.toLowerCase().includes("mac") ? (<ui_monitoring_table_1.UiMonitoringTable />) : (<div></div>);
            default:
                return <div>select a table</div>;
        }
    };
    return (<div className="flex h-screen w-full">
      <div className="w-[20%]">
        <database_sidebar_1.DatabaseSidebar currentTable={currentTable} onTableSelect={setCurrentTable}/>
      </div>
      <div className="w-[80%] p-8">
        <div className="flex justify-end mb-4">
          <search_command_1.SearchCommand />
        </div>
        <div className="w-full">{renderTable()}</div>
      </div>
    </div>);
}
