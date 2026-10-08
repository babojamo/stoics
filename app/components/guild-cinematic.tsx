"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

const playlist = "/stoics-cinematic-stream/index.m3u8";

export function GuildCinematic() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlist;
      return () => { video.removeAttribute("src"); video.load(); };
    }

    if (!Hls.isSupported()) return;
    const hls = new Hls();
    hls.loadSource(playlist);
    hls.attachMedia(video);

    return () => {
      hls.destroy();
    };
  }, []);

  return <video ref={videoRef} controls playsInline preload="none" poster="/stoics-guild-cinematic-poster.webp" aria-label="Stoics guild cinematic video">Your browser does not support HTML video.</video>;
}
