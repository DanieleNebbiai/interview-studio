"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface HeroSectionProps {
  user?: any;
  onCreateNewRoom?: () => void;
  onShowAuthModal?: () => void;
}

export function HeroSection({
  user,
  onCreateNewRoom,
  onShowAuthModal,
}: HeroSectionProps = {}) {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = React.useState(true);

  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  }, []);

  const handleVideoClick = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  const handleGetStarted = () => {
    if (user) {
      onCreateNewRoom?.();
    } else {
      onShowAuthModal?.();
    }
  };

  return (
    <header className="relative min-h-screen flex flex-col items-center justify-center px-4 pb-20">
      <div className="container mx-auto">
        {/* Hero Content */}
        <div className="text-center mb-16 max-w-4xl mx-auto">
          {/* Logo */}
          <motion.div
            className="flex items-center justify-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="w-32 h-32 mr-4"
              animate={{ rotate: 360 }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <Image
                src="/logo.png"
                alt="Interview Studio Logo"
                width={256}
                height={256}
                className="w-full h-full object-contain"
              />
            </motion.div>
          </motion.div>

          {/* Headlines */}
          <motion.h1
            className="text-2xl md:text-6xl lg:text-6xl font-bold mb-6 text-foreground leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Professiona Interview Recordings in Minutes
          </motion.h1>

          <motion.h2
            className="text-lg md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Professional video recording platform producing high-impact content
            automatically.
          </motion.h2>

          {/* CTA Button */}
          <motion.div
            className="mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="text-lg font-bold px-4 py-7"
            >
              {user ? "New Interview Room" : "Try Interview Studio for free"}
            </Button>
          </motion.div>

          <motion.div
            className="text-sm text-gray-500 mb-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            No credit card required • Free plan available
          </motion.div>
        </div>

        {/* Video Demo */}
        <motion.figure
          className="relative max-w-5xl mx-auto mb-20"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div className="relative">
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100">
              {/* Video Container */}
              <div
                className="relative w-full h-full cursor-pointer group"
                onClick={handleVideoClick}
              >
                {/* Placeholder for demo video */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-900 to-black flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-white/20 transition-all duration-300">
                      <Play className="h-8 w-8 text-white ml-1" />
                    </div>
                    <p className="text-white/80 text-lg font-medium">
                      Watch Demo Video
                    </p>
                    <p className="text-white/60 text-sm mt-2">
                      See Interview Studio in action
                    </p>
                  </div>
                </div>

                {/* Video overlay effects */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>

            {/* Video decorative elements */}
            <div className="absolute -top-4 -left-4 w-8 h-8 bg-purple-500 rounded-full opacity-20 animate-pulse" />
            <div className="absolute -bottom-6 -right-6 w-12 h-12 bg-blue-500 rounded-full opacity-20 animate-pulse animation-delay-1000" />
          </div>
        </motion.figure>

        {/* Company Logos */}
        <motion.figure
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <figcaption className="text-sm text-gray-500 mb-8">
            Trusted by content creators and teams at
          </figcaption>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-60">
            {/* Company logo placeholders */}
            {[
              { name: "Google", width: "w-20" },
              { name: "Microsoft", width: "w-24" },
              { name: "Adobe", width: "w-16" },
              { name: "Spotify", width: "w-20" },
              { name: "Netflix", width: "w-20" },
              { name: "Stripe", width: "w-16" },
            ].map((company, index) => (
              <div
                key={company.name}
                className={`${company.width} h-8 bg-gray-300 rounded flex items-center justify-center`}
              >
                <span className="text-xs text-gray-600 font-medium">
                  {company.name}
                </span>
              </div>
            ))}
          </div>
        </motion.figure>
      </div>
    </header>
  );
}
