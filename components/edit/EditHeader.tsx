"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";

interface Recording {
  id: string;
  recording_url: string;
  duration: number;
  file_size: number;
}

interface EditHeaderProps {
  roomName: string;
  syncOffsets: { [key: string]: number };
  recordings: Recording[];
  isExporting: boolean;
  onExport: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export function EditHeader({
  roomName,
  recordings,
  isExporting,
  onExport,
}: EditHeaderProps) {
  return (
    <div className="bg-card border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left: Logo + Home Link */}
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
          <motion.div
            className="w-8 h-8 mr-3"
            animate={{ rotate: 360 }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            <Image
              src="/logo.png"
              alt="Interview Studio Logo"
              width={32}
              height={32}
              className="w-full h-full object-contain"
            />
          </motion.div>
          <span className="text-xl font-bold text-foreground">
            Interview Studio
          </span>
        </Link>

        {/* Center: Project Title */}
        <div className="flex-1 text-center">
          <h1 className="text-lg font-semibold text-foreground">
            {roomName}
          </h1>
        </div>

        {/* Right: Export Button */}
        <Button
          onClick={onExport}
          disabled={isExporting || recordings.length === 0}
          size="sm"
          variant="default"
        >
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      </div>
    </div>
  );
}