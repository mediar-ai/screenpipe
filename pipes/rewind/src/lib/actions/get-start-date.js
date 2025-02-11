"use strict";
"use server";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStartDate = getStartDate;
const date_fns_1 = require("date-fns");
function getStartDate() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const videoChunkQuery = `
         SELECT
            f.timestamp,
            f.offset_index,
            ot.text,
            ot.app_name,
            ot.window_name,
            vc.device_name as screen_device,
            vc.file_path as video_path
         FROM frames f
         JOIN video_chunks vc ON f.video_chunk_id = vc.id
         LEFT JOIN ocr_text ot ON f.id = ot.frame_id
         ORDER BY f.timestamp ASC, f.offset_index ASC
         LIMIT 1

`;
            const audioChunkQuery = `
         SELECT
                at.timestamp,
                at.transcription,
                at.device as audio_device,
                at.is_input_device,
                ac.file_path as audio_path
         FROM audio_transcriptions at
         JOIN audio_chunks ac ON at.audio_chunk_id = ac.id
         ORDER BY at.timestamp ASC
         LIMIT 1
`;
            const videoFetch = fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query: videoChunkQuery }),
            });
            const audioFetch = fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query: audioChunkQuery }),
            });
            const [videoData, audioData] = yield Promise.all([videoFetch, audioFetch]);
            if (!videoData.ok || !audioData.ok) {
                return {
                    error: "error occured while getting data",
                    video: yield videoData.json(),
                    audio: yield audioData.json(),
                    query: {
                        videoChunkQuery,
                        audioChunkQuery,
                    },
                };
            }
            const video = (yield videoData.json())[0];
            const audio = (yield audioData.json())[0];
            const videoStart = new Date(video.timestamp);
            const audioStart = new Date(audio.timestamp);
            const videoGreater = (0, date_fns_1.isAfter)(videoStart, audioStart);
            return !videoGreater ? videoStart : audioStart;
        }
        catch (e) {
            return {
                error: "errro occured",
            };
        }
    });
}
