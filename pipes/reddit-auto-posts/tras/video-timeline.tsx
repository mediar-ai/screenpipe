"use client";
import React, { useEffect, useState } from "react";

interface VideoTimeLineProps {
  className?: string;
  timelineVideosPath: string[];
}

const VideoTimelineBlock: React.FC<VideoTimeLineProps> = ({
  className,
  timelineVideosPath,
}) => {
  const [error, setError] = useState(null);
  const [blobUrls, setBlobUrls] = useState<string[] | undefined>([]);

  useEffect(() => {
    const createBlobs = async (paths: string[]) => {
      try {
        const urls = await Promise.all(paths.map(async (path) => {
          const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`);
          }
          const contentType = response.headers.get('Content-Type');
          if (!contentType?.startsWith('video/')) {
            throw new Error('The file is not a video');
          }
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }));
        setBlobUrls(urls);
      } catch (error) {
        console.error("Error creating blob URL:", error);
        setError(error);
      }
    };
    createBlobs(timelineVideosPath);
  }, []);
  
  return (
    <div className={`${className}`}>
      {blobUrls?.map((url, index) => (
        <video key={index} width="" height="40px" controls={false} autoPlay={false}>
          <source src={url} type='video/mp4; codecs="hvc1"' />
          <source src={url} type='video/mp4; codecs="hvec"' />
          <source src={url} type="video/mp4" />
          <source src={url} type="video/mp4" />
        </video>
      ))}
    </div>
  );
};

export default VideoTimelineBlock;

