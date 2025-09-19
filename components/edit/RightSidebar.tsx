"use client";

import { MessageSquare, Settings, Palette, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { EditTranscriptModal } from "./EditTranscriptModal";

interface Transcription {
  id: string;
  transcript_text: string;
  word_timestamps: {
    words: Array<{
      word: string;
      start: number;
      end: number;
    }>;
    wordCount: number;
    totalDuration: number;
  };
}

interface RightSidebarProps {
  transcriptions: Transcription[];
  captionsEnabled: boolean;
  captionSize: "small" | "medium" | "large";
  onCaptionsEnabledChange: (enabled: boolean) => void;
  onCaptionSizeChange: (size: "small" | "medium" | "large") => void;
  onTranscriptionsUpdate?: (transcriptions: Transcription[]) => void;
}

type TabType = "transcriptions" | "properties" | "styles";

export function RightSidebar({
  transcriptions,
  captionsEnabled,
  captionSize,
  onCaptionsEnabledChange,
  onCaptionSizeChange,
  onTranscriptionsUpdate
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>("transcriptions");
  const [showEditModal, setShowEditModal] = useState(false);

  const tabs = [
    {
      id: "transcriptions" as TabType,
      icon: MessageSquare,
      label: "Transcriptions",
    },
    {
      id: "properties" as TabType,
      icon: Settings,
      label: "Properties",
    },
    {
      id: "styles" as TabType,
      icon: Palette,
      label: "Styles",
    },
  ];

  const renderTranscriptions = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Caption Settings</h3>

      {/* Caption Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Show Captions
          </label>
          <Switch
            checked={captionsEnabled}
            onCheckedChange={onCaptionsEnabledChange}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Mostra i sottotitoli durante la riproduzione del video
        </p>
      </div>

      {/* Caption Size - Only show when captions are enabled */}
      {captionsEnabled && (
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">
            Caption Size
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["small", "medium", "large"] as const).map((size) => (
              <Button
                key={size}
                variant={captionSize === size ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => onCaptionSizeChange(size)}
              >
                {size === "small" ? "Piccolo" : size === "medium" ? "Medio" : "Grande"}
              </Button>
            ))}
          </div>
        </div>
      )}


      {/* Edit Transcript Button */}
      <div className="pt-4 border-t border-border">
        <Button
          onClick={() => setShowEditModal(true)}
          variant="outline"
          className="w-full"
        >
          <Edit3 className="h-4 w-4 mr-2" />
          Edit Transcript
        </Button>
      </div>
    </div>
  );

  const renderProperties = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Properties</h3>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Background
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button className="w-full aspect-square rounded-lg bg-gradient-to-br from-blue-500 to-purple-600"></button>
            <button className="w-full aspect-square rounded-lg bg-gradient-to-br from-orange-500 to-pink-500"></button>
            <button className="w-full aspect-square rounded-lg bg-gradient-to-br from-green-500 to-teal-500"></button>
            <button className="w-full aspect-square rounded-lg bg-gradient-to-br from-yellow-500 to-red-500"></button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Padding
          </label>
          <div className="space-y-2">
            <input type="range" min="0" max="100" className="w-full" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Border Radius
          </label>
          <div className="space-y-2">
            <input type="range" min="0" max="50" className="w-full" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStyles = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Styles</h3>
      <div className="text-center text-muted-foreground">
        <p>Style options coming soon...</p>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "transcriptions":
        return renderTranscriptions();
      case "properties":
        return renderProperties();
      case "styles":
        return renderStyles();
      default:
        return renderTranscriptions();
    }
  };

  return (
    <div className="w-96 bg-card border-l border-border flex">
      {/* Left navigation icons */}
      <div className="w-12 bg-background border-r border-border flex flex-col items-center py-4 space-y-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              className="w-8 h-8 p-0"
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="bg-accent rounded-xl flex-1 p-6 overflow-y-auto">
        {renderContent()}
      </div>

      {/* Edit Transcript Modal */}
      <EditTranscriptModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        transcriptions={transcriptions}
        onSave={(updatedTranscriptions) => {
          onTranscriptionsUpdate?.(updatedTranscriptions);
          setShowEditModal(false);
        }}
      />
    </div>
  );
}
