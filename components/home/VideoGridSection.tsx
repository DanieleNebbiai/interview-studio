"use client";

import * as React from "react";
import { useState } from "react";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoGridItem {
  id: string;
  title: string;
  description: string;
  videoUrl?: string;
  videoPoster?: string;
}

interface VideoGridSectionProps {
  title: string;
  subtitle: string;
  videos: VideoGridItem[];
  className?: string;
}

export function VideoGridSection({
  title,
  subtitle,
  videos,
  className,
}: VideoGridSectionProps) {
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());

  const toggleVideo = (videoId: string, videoElement: HTMLVideoElement) => {
    const isPlaying = playingVideos.has(videoId);

    if (isPlaying) {
      videoElement.pause();
      setPlayingVideos((prev) => {
        const newSet = new Set(prev);
        newSet.delete(videoId);
        return newSet;
      });
    } else {
      videoElement.play();
      setPlayingVideos((prev) => new Set(prev).add(videoId));
    }
  };

  return (
    <section className={cn("py-20 px-4", className)}>
      <div className="container">
        {/* Header */}
        <motion.div
          className=" mb-16 max-w-4xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-foreground leading-tight">
            {title}
          </h2>
          <h3 className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            {subtitle}
          </h3>
        </motion.div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {videos.map((video, index) => (
            <motion.figure
              key={video.id}
              className="space-y-6"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              {/* Video Title and Description */}
              <figcaption>
                <h4 className="text-xl font-bold mb-3 text-foreground">
                  {video.title}
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  {video.description}
                </p>
              </figcaption>

              {/* Video Container */}
              <div className="relative">
                <Card className="overflow-hidden border-border shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="relative aspect-video">
                    {video.videoUrl ? (
                      <>
                        <video
                          className="w-full h-full object-cover"
                          poster={video.videoPoster}
                          loop
                          playsInline
                          preload="auto"
                          onPlay={() =>
                            setPlayingVideos((prev) =>
                              new Set(prev).add(video.id)
                            )
                          }
                          onPause={() =>
                            setPlayingVideos((prev) => {
                              const newSet = new Set(prev);
                              newSet.delete(video.id);
                              return newSet;
                            })
                          }
                          ref={(el) => {
                            if (el) {
                              el.addEventListener("click", () =>
                                toggleVideo(video.id, el)
                              );
                            }
                          }}
                        >
                          <source src={video.videoUrl} type="video/mp4" />
                        </video>

                        {/* Video Controls Overlay */}
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                          onClick={(e) => {
                            const videoElement = e.currentTarget
                              .previousElementSibling as HTMLVideoElement;
                            if (videoElement) {
                              toggleVideo(video.id, videoElement);
                            }
                          }}
                        >
                          <motion.div
                            className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            {playingVideos.has(video.id) ? (
                              <Pause className="h-6 w-6 text-gray-900" />
                            ) : (
                              <Play className="h-6 w-6 text-gray-900 ml-0.5" />
                            )}
                          </motion.div>
                        </div>
                      </>
                    ) : (
                      // Placeholder if no video
                      <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Play className="h-8 w-8 text-primary" />
                          </div>
                          <p className="text-muted-foreground font-medium">
                            {video.title}
                          </p>
                          <p className="text-muted-foreground text-sm mt-1">
                            Demo Video
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
