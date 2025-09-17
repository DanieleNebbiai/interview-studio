"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { useRouter } from "next/navigation";

interface EditHeaderProps {
  roomName: string;
  syncOffsets: { [key: string]: number };
  recordings: any[];
  isExporting: boolean;
  onExport: () => void;
  onRefresh: () => void;
  loading: boolean;
}

export function EditHeader({
  roomName,
  syncOffsets,
  recordings,
  isExporting,
  onExport,
  onRefresh,
  loading,
}: EditHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center space-x-4">
        <Button onClick={() => router.push("/recordings")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Indietro
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editor Video</h1>
          <p className="text-gray-600">Room: {roomName}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {Object.keys(syncOffsets).length > 0 && (
          <div className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
            ✂️ Video tagliati automaticamente ({Object.keys(syncOffsets).length}{" "}
            offset applicati)
            {recordings?.some((r) => r.recording_started_at)
              ? ""
              : " - usando created_at"}
          </div>
        )}

        <Button onClick={onExport} variant="default" disabled={isExporting}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? "Esportando..." : "Esporta Video"}
        </Button>
      </div>
    </div>
  );
}
