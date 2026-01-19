"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  HardDrive,
  Video,
  Mic,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { format, subDays } from "date-fns";

interface StorageStats {
  totalSize: number;
  videoSize: number;
  videoCount: number;
  audioSize: number;
  audioCount: number;
  ocrCount: number;
  oldestDate: string;
  newestDate: string;
}

interface DeletePreview {
  videoCount: number;
  audioCount: number;
  ocrCount: number;
  estimatedSize: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const DataManager: React.FC = () => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [deleteDays, setDeleteDays] = useState<number>(7);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      // Get video chunks count and estimate size
      const videoQuery = `
        SELECT COUNT(*) as count FROM video_chunks;
      `;

      const audioQuery = `
        SELECT COUNT(*) as count FROM audio_chunks;
      `;

      const ocrQuery = `
        SELECT COUNT(*) as count FROM ocr_text;
      `;

      const dateRangeQuery = `
        SELECT
          MIN(timestamp) as oldest,
          MAX(timestamp) as newest
        FROM frames;
      `;

      const [videoRes, audioRes, ocrRes, dateRes] = await Promise.all([
        fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: videoQuery }),
        }),
        fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: audioQuery }),
        }),
        fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: ocrQuery }),
        }),
        fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: dateRangeQuery }),
        }),
      ]);

      const [video, audio, ocr, dateRange] = await Promise.all([
        videoRes.json(),
        audioRes.json(),
        ocrRes.json(),
        dateRes.json(),
      ]);

      // Estimate sizes (rough estimates based on typical file sizes)
      const videoCount = video[0]?.count || 0;
      const audioCount = audio[0]?.count || 0;
      const ocrCount = ocr[0]?.count || 0;

      // Rough estimates: video ~5MB/chunk, audio ~500KB/chunk
      const videoSize = videoCount * 5 * 1024 * 1024;
      const audioSize = audioCount * 500 * 1024;
      const totalSize = videoSize + audioSize;

      setStats({
        totalSize,
        videoSize,
        videoCount,
        audioSize,
        audioCount,
        ocrCount,
        oldestDate: dateRange[0]?.oldest || "",
        newestDate: dateRange[0]?.newest || "",
      });
      setError(null);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      setError("Could not connect to screenpipe. Make sure it's running on port 3030.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDeletePreview = useCallback(async (days: number) => {
    const cutoffDate = format(subDays(new Date(), days), "yyyy-MM-dd HH:mm:ss");

    try {
      const videoQuery = `
        SELECT COUNT(*) as count FROM video_chunks vc
        JOIN frames f ON vc.id = f.video_chunk_id
        WHERE datetime(f.timestamp) < datetime('${cutoffDate}');
      `;

      const audioQuery = `
        SELECT COUNT(*) as count FROM audio_chunks
        WHERE datetime(timestamp) < datetime('${cutoffDate}');
      `;

      const ocrQuery = `
        SELECT COUNT(*) as count FROM ocr_text ot
        JOIN frames f ON ot.frame_id = f.id
        WHERE datetime(f.timestamp) < datetime('${cutoffDate}');
      `;

      const [videoRes, audioRes, ocrRes] = await Promise.all([
        fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: videoQuery }),
        }),
        fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: audioQuery }),
        }),
        fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: ocrQuery }),
        }),
      ]);

      const [video, audio, ocr] = await Promise.all([
        videoRes.json(),
        audioRes.json(),
        ocrRes.json(),
      ]);

      const videoCount = video[0]?.count || 0;
      const audioCount = audio[0]?.count || 0;
      const ocrCount = ocr[0]?.count || 0;

      setDeletePreview({
        videoCount,
        audioCount,
        ocrCount,
        estimatedSize: videoCount * 5 * 1024 * 1024 + audioCount * 500 * 1024,
      });
    } catch (err) {
      console.error("Failed to fetch delete preview:", err);
    }
  }, []);

  const executeDelete = async () => {
    setIsDeleting(true);
    const cutoffDate = format(subDays(new Date(), deleteDays), "yyyy-MM-dd HH:mm:ss");

    try {
      // Delete in order: ocr_text -> frames -> video_chunks -> audio_transcriptions -> audio_chunks
      const deleteQueries = [
        `DELETE FROM ocr_text WHERE frame_id IN (
          SELECT id FROM frames WHERE datetime(timestamp) < datetime('${cutoffDate}')
        );`,
        `DELETE FROM frames WHERE datetime(timestamp) < datetime('${cutoffDate}');`,
        `DELETE FROM video_chunks WHERE id NOT IN (SELECT DISTINCT video_chunk_id FROM frames);`,
        `DELETE FROM audio_transcriptions WHERE datetime(timestamp) < datetime('${cutoffDate}');`,
        `DELETE FROM audio_chunks WHERE datetime(timestamp) < datetime('${cutoffDate}');`,
      ];

      for (const query of deleteQueries) {
        await fetch("http://localhost:3030/raw_sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
      }

      setDeleteSuccess(true);
      setShowConfirm(false);
      await fetchStats();
      setDeletePreview(null);

      setTimeout(() => setDeleteSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to delete data:", err);
      setError("Failed to delete data. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (deleteDays) {
      fetchDeletePreview(deleteDays);
    }
  }, [deleteDays, fetchDeletePreview]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl flex items-center gap-3">
          <RefreshCw className="animate-spin" />
          Loading storage stats...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-600 rounded-xl">
          <HardDrive className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Data Manager</h1>
          <p className="text-slate-400">Manage your screenpipe storage</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-600 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {deleteSuccess && (
        <div className="bg-green-900/50 border border-green-600 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="text-green-400" />
          <span>Data deleted successfully!</span>
        </div>
      )}

      {/* Storage Overview */}
      <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Storage Overview</h2>

        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-slate-400">Total Storage Used</span>
            <span className="text-2xl font-bold">{formatBytes(stats?.totalSize || 0)}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-full rounded-full"
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Video className="text-blue-400" />
              <span className="text-slate-300">Video</span>
            </div>
            <div className="text-2xl font-bold">{formatBytes(stats?.videoSize || 0)}</div>
            <div className="text-sm text-slate-400">{stats?.videoCount || 0} chunks</div>
          </div>

          <div className="bg-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Mic className="text-green-400" />
              <span className="text-slate-300">Audio</span>
            </div>
            <div className="text-2xl font-bold">{formatBytes(stats?.audioSize || 0)}</div>
            <div className="text-sm text-slate-400">{stats?.audioCount || 0} chunks</div>
          </div>

          <div className="bg-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="text-purple-400" />
              <span className="text-slate-300">OCR Text</span>
            </div>
            <div className="text-2xl font-bold">{stats?.ocrCount || 0}</div>
            <div className="text-sm text-slate-400">entries</div>
          </div>
        </div>

        {stats?.oldestDate && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>
              Data from {format(new Date(stats.oldestDate), "MMM d, yyyy")} to{" "}
              {format(new Date(stats.newestDate), "MMM d, yyyy")}
            </span>
          </div>
        )}
      </div>

      {/* Cleanup Section */}
      <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Trash2 className="text-red-400" />
          Quick Cleanup
        </h2>

        <p className="text-slate-400 mb-4">
          Delete data older than a specified number of days to free up storage.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          {[1, 7, 14, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => setDeleteDays(days)}
              className={`px-4 py-2 rounded-lg transition ${
                deleteDays === days
                  ? "bg-red-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {days === 1 ? "1 day" : `${days} days`}
            </button>
          ))}
        </div>

        {deletePreview && (
          <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
            <h3 className="font-semibold mb-2 text-yellow-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Data older than {deleteDays} day{deleteDays > 1 ? "s" : ""} will be deleted:
            </h3>
            <ul className="space-y-1 text-slate-300">
              <li>• {deletePreview.videoCount} video chunks (~{formatBytes(deletePreview.videoCount * 5 * 1024 * 1024)})</li>
              <li>• {deletePreview.audioCount} audio chunks (~{formatBytes(deletePreview.audioCount * 500 * 1024)})</li>
              <li>• {deletePreview.ocrCount} OCR entries</li>
            </ul>
            <div className="mt-3 text-lg font-semibold text-green-400">
              Estimated space freed: {formatBytes(deletePreview.estimatedSize)}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!deletePreview || (deletePreview.videoCount === 0 && deletePreview.audioCount === 0)}
          className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-xl font-semibold transition flex items-center justify-center gap-2"
        >
          <Trash2 className="w-5 h-5" />
          Delete Old Data
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-400">
              <AlertTriangle />
              Confirm Deletion
            </h3>
            <p className="text-slate-300 mb-4">
              Are you sure you want to permanently delete all data older than{" "}
              <strong>{deleteDays} day{deleteDays > 1 ? "s" : ""}</strong>?
            </p>
            <p className="text-sm text-slate-400 mb-6">
              This action cannot be undone. The associated files will also be orphaned.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 bg-slate-600 hover:bg-slate-500 rounded-xl font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-800 rounded-xl font-semibold transition flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-slate-500 text-sm">
        Powered by Screenpipe
      </div>
    </div>
  );
};
