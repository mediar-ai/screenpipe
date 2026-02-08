"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export default function VideoSeekTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [isTauri, setIsTauri] = useState(false);

  const log = useCallback((msg: string) => {
    const ts = performance.now().toFixed(1);
    const line = `[${ts}ms] ${msg}`;
    console.log(line);
    setLogs(prev => [line, ...prev].slice(0, 80));
  }, []);

  useEffect(() => {
    const hasTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
    setIsTauri(hasTauri);
    log(`Tauri detected: ${hasTauri}`);
    if (hasTauri) {
      import("@tauri-apps/api/path").then(async ({ homeDir }) => {
        try {
          const home = await homeDir();
          log(`homeDir() = "${home}"`);
          const sep = home.endsWith("/") ? "" : "/";
          setFilePath(`${home}${sep}.screenpipe/data/monitor_1_2026-02-06_20-34-24.mp4`);
        } catch (e) {
          log(`Error: ${e}`);
        }
      });
    }
  }, [log]);

  // Method 1: Asset protocol via convertFileSrc
  const loadViaAsset = useCallback(async () => {
    if (!filePath) return;
    try {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const src = convertFileSrc(filePath);
      log(`[Asset] URL: ${src}`);
      setVideoSrc(src);
      setIsLoaded(false);
    } catch (e) {
      log(`❌ [Asset] FAILED: ${e}`);
    }
  }, [filePath, log]);

  // Method 2: Read file via Tauri command → blob URL
  const loadViaBlob = useCallback(async () => {
    if (!filePath) return;
    try {
      const startMs = performance.now();
      log(`[Blob] Reading file via Tauri command...`);
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ data: string; mimeType: string }>("get_media_file", { filePath });
      log(`[Blob] File read in ${(performance.now() - startMs).toFixed(0)}ms, size=${result.data.length} chars`);
      
      const binaryData = atob(result.data);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      log(`[Blob] Blob URL created: ${blobUrl.slice(0, 50)}...`);
      setVideoSrc(blobUrl);
      setIsLoaded(false);
    } catch (e) {
      log(`❌ [Blob] FAILED: ${e}`);
    }
  }, [filePath, log]);

  // Method 3: HTTP stream from screenpipe server  
  const loadViaHttp = useCallback(async () => {
    if (!filePath) return;
    // Use the existing frames endpoint but with a direct file serve
    const src = `http://localhost:3030/experimental/video?path=${encodeURIComponent(filePath)}`;
    log(`[HTTP] URL: ${src}`);
    setVideoSrc(src);
    setIsLoaded(false);
  }, [filePath, log]);

  // When videoSrc changes, set it on the element and call load()
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    log(`Setting video.src and calling load()...`);
    video.src = videoSrc;
    video.load();
  }, [videoSrc, log]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const startMs = performance.now();
    log(`Seeking to ${seconds}s...`);
    const onSeeked = () => {
      const elapsed = performance.now() - startMs;
      log(`✅ seeked in ${elapsed.toFixed(1)}ms → currentTime=${video.currentTime.toFixed(3)}s`);
      setCurrentTime(video.currentTime);
      video.removeEventListener("seeked", onSeeked);
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = seconds;
  }, [log]);

  const runBenchmark = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isLoaded) { log("Video not loaded"); return; }
    log("=== BENCHMARK: 8 random seeks ===");
    const offsets = [0, 10, 20, 30, 0, 20, 10, 30];
    const times: number[] = [];
    for (const offset of offsets) {
      const start = performance.now();
      video.currentTime = offset;
      await new Promise<void>(r => {
        const h = () => { video.removeEventListener("seeked", h); r(); };
        video.addEventListener("seeked", h);
      });
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    log(`=== RESULT: avg=${avg.toFixed(1)}ms, min=${Math.min(...times).toFixed(1)}ms, max=${Math.max(...times).toFixed(1)}ms ===`);
    times.forEach((t, i) => log(`  seek[${i}] to ${offsets[i]}s: ${t.toFixed(1)}ms`));
  }, [isLoaded, log]);

  return (
    <div className="p-4 space-y-4 bg-black text-white min-h-screen font-mono text-sm">
      <h1 className="text-xl font-bold font-sans">Video Seek Prototype Test</h1>
      
      {!isTauri && (
        <div className="p-3 bg-yellow-900 border border-yellow-600 rounded text-yellow-200">
          ⚠️ Open this inside the screenpipe Tauri app, not a browser.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-gray-400">MP4 file path:</label>
        <input type="text" value={filePath} onChange={e => setFilePath(e.target.value)}
          className="w-full p-2 bg-gray-900 border border-gray-700 rounded" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={loadViaAsset} disabled={!isTauri}
            className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-30">
            1. Asset Protocol
          </button>
          <button onClick={loadViaBlob} disabled={!isTauri}
            className="px-3 py-1 bg-green-600 rounded hover:bg-green-500 disabled:opacity-30">
            2. Blob URL (read file)
          </button>
          <button onClick={loadViaHttp}
            className="px-3 py-1 bg-orange-600 rounded hover:bg-orange-500">
            3. HTTP (needs endpoint)
          </button>
        </div>
      </div>

      {videoSrc && (
        <div className="space-y-2">
          <div className="border border-gray-700 rounded overflow-hidden" style={{ maxWidth: 960 }}>
            <video ref={videoRef} muted playsInline preload="auto" className="w-full"
              onLoadedData={() => {
                const v = videoRef.current!;
                setIsLoaded(true);
                setDuration(v.duration);
                setDimensions({ w: v.videoWidth, h: v.videoHeight });
                log(`✅ LOADED: ${v.duration.toFixed(1)}s, ${v.videoWidth}x${v.videoHeight}`);
              }}
              onError={() => {
                const err = videoRef.current?.error;
                log(`❌ VIDEO ERROR: code=${err?.code}, message="${err?.message}"`);
                log(`   code 1=aborted, 2=network, 3=decode, 4=src_not_supported`);
              }}
              onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
            />
          </div>
          
          <div className="text-gray-400">
            Loaded: {isLoaded ? "✅" : "⏳"} | Duration: {duration.toFixed(1)}s | 
            Current: {currentTime.toFixed(3)}s | Size: {dimensions.w}×{dimensions.h}
          </div>

          {isLoaded && (
            <div className="flex gap-2 flex-wrap">
              {[0, 10, 20, 30].map(t => (
                <button key={t} onClick={() => seekTo(t)}
                  className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600">
                  Seek {t}s
                </button>
              ))}
              <button onClick={runBenchmark}
                className="px-3 py-1 bg-purple-600 rounded hover:bg-purple-500">
                Benchmark (8 seeks)
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1">
        <h2 className="text-gray-400 font-bold">Logs:</h2>
        <div className="bg-gray-900 border border-gray-700 rounded p-2 max-h-96 overflow-y-auto text-xs">
          {logs.length === 0 ? (
            <span className="text-gray-600">Load a video to start.</span>
          ) : logs.map((line, i) => (
            <div key={i} className={
              line.includes("❌") ? "text-red-400" : 
              line.includes("✅") ? "text-green-400" : 
              line.includes("===") ? "text-yellow-400" : "text-gray-300"
            }>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
