"use strict";
"use client";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.KeywordCloud = void 0;
const react_1 = __importStar(require("react"));
const KeywordCloud = () => {
    const [keywords, setKeywords] = (0, react_1.useState)([]);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const processContentStreaming = () => __awaiter(void 0, void 0, void 0, function* () {
        console.log("fetching keyword stats...");
        const url = new URL("http://localhost:3030/raw_sql");
        const query = `
      WITH RECURSIVE
      split(word, str) AS (
        SELECT '', content || ' '
        FROM (
          -- Get OCR text and audio from last 12h
          SELECT text as content
          FROM ocr_text ot
          JOIN frames f ON ot.frame_id = f.id
          WHERE datetime(timestamp) >= datetime('now', '-12 hours')
          UNION ALL
          SELECT transcription as content
          FROM audio_transcriptions
          WHERE datetime(timestamp) >= datetime('now', '-12 hours')
        )
        UNION ALL
        SELECT
          LOWER(SUBSTR(str, 0, INSTR(str, ' '))),
          SUBSTR(str, INSTR(str, ' ')+1)
        FROM split WHERE str!=''
      )
      SELECT 
        word,
        COUNT(*) as count
      FROM split
      WHERE length(word) > 3
        AND word NOT IN ('this', 'that', 'with', 'from', 'have', 'what', 'your', 'which', 'their', 'about')
      GROUP BY word
      HAVING count > 5
      ORDER BY count DESC
      LIMIT 50;
    `;
        try {
            const response = yield fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });
            if (!response.ok) {
                throw new Error(`http error! status: ${response.status}`);
            }
            const result = yield response.json();
            console.log("received keyword stats:", result);
            setKeywords(result.map((row) => ({
                word: row.word,
                count: row.count
            })));
        }
        catch (err) {
            console.error("failed to fetch keyword stats:", err);
            setError("error fetching keyword stats");
        }
        finally {
            setIsLoading(false);
        }
    });
    (0, react_1.useEffect)(() => {
        processContentStreaming();
    }, []);
    if (isLoading)
        return <div>loading...</div>;
    if (error)
        return <div>error: {error}</div>;
    return (<div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-4">top keywords (last 24h)</h2>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword) => (<span key={keyword.word} className="px-2 py-1 bg-white rounded-full text-sm flex items-center" style={{
                fontSize: `${Math.max(0.8, Math.min(2, keyword.count / 10))}rem`,
            }}>
            {keyword.word}
            <span className="ml-1 text-xs text-gray-500">({keyword.count})</span>
          </span>))}
      </div>
    </div>);
};
exports.KeywordCloud = KeywordCloud;
