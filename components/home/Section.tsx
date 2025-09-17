"use client";

import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureItem {
  id: string;
  title: string;
  description: string;
  active?: boolean;
}

interface SectionProps {
  title: string;
  subtitle: string;
  features: FeatureItem[];
  videoUrl?: string;
  videoPoster?: string;
  className?: string;
}

export function Section({
  title,
  subtitle,
  features,
  videoUrl,
  videoPoster,
  className,
}: SectionProps) {
  const [activeFeature, setActiveFeature] = useState(features[0]?.id || "");
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const handleFeatureClick = (featureId: string) => {
    setActiveFeature(featureId);
  };

  const toggleVideo = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  return (
    <section className={cn("py-20 px-4", className)}>
      <div className="container mx-auto">
        {/* Header */}
        <motion.div
          className="mb-16 max-w-4xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-foreground leading-tight">
            {title}
          </h2>
          <h3 className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            {subtitle}
          </h3>
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Features List */}
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.2, delay: 0.2 }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.1, delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-lg border py-0",
                    activeFeature === feature.id
                      ? "bg-muted"
                      : "hover:bg-accent"
                  )}
                  onClick={() => handleFeatureClick(feature.id)}
                >
                  <CardContent className="p-6">
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      transition={{ duration: 0.2 }}
                    >
                      <h4
                        className={cn(
                          "text-lg font-semibold mb-2 transition-colors",
                          activeFeature === feature.id
                            ? "text-foreground"
                            : "text-foreground"
                        )}
                      >
                        {feature.title}
                      </h4>
                      <p className="text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* Video Player */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.2, delay: 0.4 }}
          >
            <Card className="overflow-hidden border-border shadow-2xl">
              <div className="relative aspect-video">
                {videoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      poster={videoPoster}
                      loop
                      playsInline
                      preload="auto"
                      onPlay={() => setIsVideoPlaying(true)}
                      onPause={() => setIsVideoPlaying(false)}
                    >
                      <source src={videoUrl} type="video/mp4" />
                    </video>

                    {/* Video Controls Overlay */}
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                      onClick={toggleVideo}
                    >
                      <motion.div
                        className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <AnimatePresence mode="wait">
                          {isVideoPlaying ? (
                            <motion.div
                              key="pause"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.2 }}
                            >
                              <Pause className="h-6 w-6 text-gray-900 ml-0.5" />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="play"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.2 }}
                            >
                              <Play className="h-6 w-6 text-gray-900 ml-1" />
                            </motion.div>
                          )}
                        </AnimatePresence>
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
                      <p className="text-muted-foreground">Video Preview</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
