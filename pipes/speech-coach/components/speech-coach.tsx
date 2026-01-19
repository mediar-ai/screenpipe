"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Mic, TrendingUp, AlertCircle, CheckCircle, RefreshCw, Volume2 } from "lucide-react";

interface SpeechMetrics {
  totalWords: number;
  fillerWords: Record<string, number>;
  totalFillers: number;
  fillerRate: number;
  wordsPerMinute: number;
  sessionDuration: number;
  transcriptions: string[];
}

interface TranscriptionRow {
  transcription: string;
  timestamp: string;
  start_time: number;
  end_time: number;
}

const FILLER_WORDS = [
  "um", "uh", "uhh", "umm", "er", "ah", "like", "you know", "basically",
  "literally", "actually", "right", "so", "well", "i mean", "kind of",
  "sort of", "you see", "okay", "honestly", "obviously"
];

const TIPS: Record<string, string> = {
  um: "Try pausing silently instead of saying 'um'. A brief pause sounds more confident.",
  uh: "Replace 'uh' with a breath pause. It gives you time to think and sounds more polished.",
  like: "Be specific! Instead of 'like', describe exactly what you mean.",
  "you know": "Trust that your audience is following along. Remove 'you know' for cleaner speech.",
  basically: "'Basically' can undermine your point. State things directly.",
  literally: "Use 'literally' only for things that are actually literal.",
  actually: "'Actually' can sound corrective. Consider if it's needed.",
  right: "Avoid seeking validation with 'right?'. State your points with confidence.",
  so: "Starting sentences with 'so' is common but can be reduced for impact.",
};

export const SpeechCoach: React.FC = () => {
  const [metrics, setMetrics] = useState<SpeechMetrics>({
    totalWords: 0,
    fillerWords: {},
    totalFillers: 0,
    fillerRate: 0,
    wordsPerMinute: 0,
    sessionDuration: 0,
    transcriptions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [timeRange, setTimeRange] = useState<"1h" | "6h" | "24h">("1h");

  const analyzeSpeech = useCallback((transcriptions: TranscriptionRow[]): SpeechMetrics => {
    const allText = transcriptions.map(t => t.transcription).join(" ").toLowerCase();
    const words = allText.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;

    // Count filler words
    const fillerWords: Record<string, number> = {};
    let totalFillers = 0;

    FILLER_WORDS.forEach(filler => {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = allText.match(regex);
      const count = matches ? matches.length : 0;
      if (count > 0) {
        fillerWords[filler] = count;
        totalFillers += count;
      }
    });

    // Calculate session duration from timestamps
    let sessionDuration = 0;
    if (transcriptions.length > 0) {
      const times = transcriptions.map(t => new Date(t.timestamp).getTime());
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      sessionDuration = (maxTime - minTime) / 1000 / 60; // in minutes
    }

    // Calculate WPM
    const wordsPerMinute = sessionDuration > 0 ? Math.round(totalWords / sessionDuration) : 0;

    // Filler rate (fillers per 100 words)
    const fillerRate = totalWords > 0 ? (totalFillers / totalWords) * 100 : 0;

    return {
      totalWords,
      fillerWords,
      totalFillers,
      fillerRate,
      wordsPerMinute,
      sessionDuration,
      transcriptions: transcriptions.slice(-5).map(t => t.transcription),
    };
  }, []);

  const fetchSpeechData = useCallback(async () => {
    const timeRanges = { "1h": "-1 hours", "6h": "-6 hours", "24h": "-24 hours" };
    const timeFilter = timeRanges[timeRange];

    const query = `
      SELECT transcription, timestamp, start_time, end_time
      FROM audio_transcriptions
      WHERE datetime(timestamp) >= datetime('now', '${timeFilter}')
        AND is_input_device = 1
      ORDER BY timestamp DESC
      LIMIT 1000;
    `;

    try {
      const response = await fetch("http://localhost:3030/raw_sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: TranscriptionRow[] = await response.json();
      const analyzed = analyzeSpeech(result);
      setMetrics(analyzed);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch speech data:", err);
      setError("Could not connect to screenpipe. Make sure it's running on port 3030.");
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, analyzeSpeech]);

  useEffect(() => {
    fetchSpeechData();

    // Poll for updates if live mode
    let interval: NodeJS.Timeout;
    if (isLive) {
      interval = setInterval(fetchSpeechData, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchSpeechData, isLive]);

  const getScoreColor = (rate: number) => {
    if (rate < 2) return "text-green-400";
    if (rate < 5) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreLabel = (rate: number) => {
    if (rate < 2) return "Excellent";
    if (rate < 5) return "Good";
    if (rate < 10) return "Needs Work";
    return "High Filler Usage";
  };

  const topFillers = Object.entries(metrics.fillerWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl flex items-center gap-3">
          <RefreshCw className="animate-spin" />
          Analyzing your speech...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-600 rounded-xl">
            <Mic className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Speech Coach</h1>
            <p className="text-slate-400">Real-time feedback on your speaking</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {(["1h", "6h", "24h"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 rounded-lg text-sm ${
                  timeRange === range
                    ? "bg-purple-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isLive ? "bg-red-600" : "bg-slate-700 hover:bg-slate-600"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-slate-400"}`} />
            {isLive ? "Live" : "Paused"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-600 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Score Card */}
      <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className={`text-5xl font-bold ${getScoreColor(metrics.fillerRate)}`}>
              {metrics.fillerRate.toFixed(1)}%
            </div>
            <div className="text-slate-400 mt-1">Filler Rate</div>
            <div className={`text-sm mt-1 ${getScoreColor(metrics.fillerRate)}`}>
              {getScoreLabel(metrics.fillerRate)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold text-blue-400">{metrics.totalFillers}</div>
            <div className="text-slate-400 mt-1">Total Fillers</div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold text-purple-400">{metrics.wordsPerMinute}</div>
            <div className="text-slate-400 mt-1">Words/Min</div>
            <div className="text-sm mt-1 text-slate-500">
              {metrics.wordsPerMinute < 120 ? "Slow" : metrics.wordsPerMinute > 180 ? "Fast" : "Good pace"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold text-slate-300">{metrics.totalWords}</div>
            <div className="text-slate-400 mt-1">Total Words</div>
          </div>
        </div>
      </div>

      {/* Filler Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Volume2 className="text-purple-400" />
            Top Filler Words
          </h2>
          {topFillers.length > 0 ? (
            <div className="space-y-3">
              {topFillers.map(([word, count]) => (
                <div key={word} className="flex items-center gap-3">
                  <div className="w-20 font-mono text-purple-300">"{word}"</div>
                  <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-pink-600 h-full rounded-full"
                      style={{ width: `${Math.min((count / metrics.totalFillers) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="w-12 text-right text-slate-400">{count}x</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-400 flex items-center gap-2">
              <CheckCircle className="text-green-400" />
              No filler words detected!
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="text-green-400" />
            Tips for Improvement
          </h2>
          <div className="space-y-3">
            {topFillers.slice(0, 3).map(([word]) => (
              <div key={word} className="p-3 bg-slate-700/50 rounded-lg">
                <div className="font-semibold text-purple-300 mb-1">"{word}"</div>
                <div className="text-sm text-slate-300">
                  {TIPS[word] || "Try to be more conscious of this word and pause instead."}
                </div>
              </div>
            ))}
            {topFillers.length === 0 && (
              <div className="text-slate-400">
                Great job! Keep up the excellent speech habits.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transcriptions */}
      <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Speech</h2>
        {metrics.transcriptions.length > 0 ? (
          <div className="space-y-2 font-mono text-sm">
            {metrics.transcriptions.map((t, i) => (
              <div key={i} className="p-3 bg-slate-700/30 rounded-lg text-slate-300">
                {t}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-400">
            No recent transcriptions. Start speaking to see your analysis!
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 text-center text-slate-500 text-sm">
        Powered by Screenpipe • Inspired by Poised AI
      </div>
    </div>
  );
};
