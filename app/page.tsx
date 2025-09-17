"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/AuthModal";
import { Header } from "@/components/home/Header";
import { HeroSection } from "@/components/home/HeroSection";
import { LoadingSpinner } from "@/components/home/LoadingSpinner";
import { Section } from "@/components/home/Section";
import { VideoGridSection } from "@/components/home/VideoGridSection";
import { PricingSection } from "@/components/home/PricingSection";

export default function Home() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [recentRecordings, setRecentRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (user && !loading) {
      fetchRecentRecordings();
    }
  }, [user, loading]);

  const fetchRecentRecordings = async () => {
    try {
      setLoadingRecordings(true);
      const response = await fetch("/api/recordings/list?limit=3", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setRecentRecordings(data.recordings || []);
      }
    } catch (error) {
      console.error("Error fetching recent recordings:", error);
    } finally {
      setLoadingRecordings(false);
    }
  };

  const createNewRoom = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    // Small delay to ensure auth cookies are set
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      // Generiamo un room ID più semplice e condivisibile
      const newRoomId = `room-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .substring(2, 5)}`;

      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for authentication
        body: JSON.stringify({
          roomName: newRoomId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.push(`/room/${data.room.dailyRoomName}`);
      } else {
        console.error("Failed to create room:", data.error);
        // Fallback to old method
        router.push(`/room/${newRoomId}`);
      }
    } catch (error) {
      console.error("Error creating room:", error);
      // Fallback to old method
      const newRoomId = `room-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .substring(2, 5)}`;
      router.push(`/room/${newRoomId}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const joinRoom = (roomId: string) => {
    if (roomId.trim()) {
      router.push(`/room/${roomId}`);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        user={user}
        onSignOut={handleSignOut}
        onShowAuthModal={() => setShowAuthModal(true)}
        onCreateNewRoom={createNewRoom}
      />

      <div className="container mx-auto px-4 py-16">
        <HeroSection
          user={user}
          onCreateNewRoom={createNewRoom}
          onShowAuthModal={() => setShowAuthModal(true)}
        />

        {/* Professional Recording Features Section */}
        <Section
          title="Professional recording for every participant"
          subtitle="Capture crystal-clear audio and video with separate tracks for each participant. Perfect for interviews, podcasts, and team meetings."
          features={[
            {
              id: "separate-tracks",
              title: "Separate HD tracks",
              description:
                "Each participant gets their own high-definition video and audio track, ensuring perfect quality for post-production editing.",
            },
            {
              id: "real-time-sync",
              title: "Real-time synchronization",
              description:
                "All tracks are automatically synchronized in real-time, eliminating the need for manual alignment during editing.",
            },
            {
              id: "multi-participant",
              title: "Up to 8 participants",
              description:
                "Record meetings and interviews with up to 8 participants simultaneously, each with their own dedicated track.",
            },
            {
              id: "broadcast-quality",
              title: "Broadcast quality",
              description:
                "Professional-grade recording with noise reduction and audio enhancement for television and streaming platforms.",
            },
          ]}
        />

        {/* AI-Powered Editing Section */}
        <Section
          title="AI-powered editing that works like magic"
          subtitle="Let artificial intelligence handle the heavy lifting. Automatic scene detection, color grading, and professional post-processing."
          features={[
            {
              id: "auto-editing",
              title: "Automatic editing",
              description:
                "Our AI analyzes your recording and automatically creates cuts, transitions, and highlights for a professional result.",
            },
            {
              id: "noise-reduction",
              title: "Noise reduction",
              description:
                "Advanced AI algorithms remove background noise, echo, and audio artifacts for crystal-clear sound quality.",
            },
            {
              id: "color-grading",
              title: "Professional color grading",
              description:
                "Automatic color correction and grading ensures consistent, professional-looking video across all participants.",
            },
            {
              id: "smart-cropping",
              title: "Smart cropping",
              description:
                "AI automatically crops and frames each participant optimally, creating engaging multi-camera layouts.",
            },
          ]}
        />

        {/* Export & Sharing Section */}
        <Section
          title="Export and share in any format"
          subtitle="Download your finished videos optimized for any platform. From YouTube to social media, we've got you covered."
          features={[
            {
              id: "multi-format",
              title: "Multiple export formats",
              description:
                "Export in MP4, MOV, or WebM with customizable resolution, bitrate, and compression settings.",
            },
            {
              id: "platform-optimization",
              title: "Platform optimization",
              description:
                "Pre-configured export presets for YouTube, Instagram, TikTok, LinkedIn, and other popular platforms.",
            },
            {
              id: "cloud-storage",
              title: "Cloud storage integration",
              description:
                "Direct upload to Google Drive, Dropbox, or your preferred cloud storage service with automatic sharing links.",
            },
            {
              id: "fast-processing",
              title: "Lightning-fast processing",
              description:
                "Our cloud infrastructure processes your videos up to 10x faster than traditional editing software.",
            },
          ]}
        />

        {/* Video Customization & Editing Features */}
        <VideoGridSection
          title="Add your style and branding"
          subtitle="Whatever you record, it will match your brand. Change the background, outer spacing, shadow, inset, and more."
          videos={[
            {
              id: "background-spacing",
              title: "Background and spacing",
              description:
                "Easily change the background or spacing around your video for perfect branding.",
            },
            {
              id: "horizontal-vertical",
              title: "Horizontal and vertical output",
              description:
                "With one click, change the desired output of your video. All animations will be automatically adjusted.",
            },
            {
              id: "shadow-inset",
              title: "Shadow and inset",
              description:
                "To adjust subtle details, change the shadow or inset of your video for professional polish.",
            },
            {
              id: "cut-speed",
              title: "Cut & Speed up",
              description:
                "Easily trim, cut, or speed up parts of your recording with intelligent editing tools.",
            },
          ]}
        />

        {/* Pricing Section */}
        <PricingSection />
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}
