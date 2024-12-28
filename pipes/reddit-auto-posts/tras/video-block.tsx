"use client";
import React, { useEffect, useState, useCallback } from "react";
import getBlobUrl from "@/components/media-blob";


interface VideoBlockProps {
  className?: string;
  mainVideoPath?: string;
  timelineVideosPath?: string[];
}

const VideoBlock: React.FC<VideoBlockProps> = ({
  className,
  mainVideoPath,
  timelineVideosPath,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);
  
  useEffect(() => {
    async function loadMedia() {
      const filePath = "C:\\Users\\eirae\\.screenpipe\\data\\monitor_65537_2024-12-22_08-23-35.mp4";
      const result = await getBlobUrl(filePath);
      console.log(result?.blobUrl)
      setBlobUrl(result?.blobUrl);
    }

    loadMedia();
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl])

  return (
    <div className={`${className}`}>
      <video width="400px" height="500px" controls={true}>
        <source src={blobUrl} type='video/mp4; codecs="hvc1"' />
        <source src={blobUrl} type='video/mp4; codecs="hvec"' />
        <source src={blobUrl} type="video/mp4" />
        <source src={blobUrl} type="video/mp4" />
      </video>
    </div>
  );
};

export default VideoBlock;

