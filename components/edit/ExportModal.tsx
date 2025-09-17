'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, CheckCircle, Link } from "lucide-react"
import { ExportSettings } from "@/hooks/useVideoExport"

interface VideoSection {
  id: string
  startTime: number
  endTime: number
  isDeleted: boolean
  playbackSpeed: number
  focusedParticipantId?: string
}

interface ExportModalProps {
  isOpen: boolean
  isExporting: boolean
  exportStatus: {
    stage: string
    message: string
    percentage: number
    downloadUrl?: string
    error?: string
    jobId: string | null
  }
  duration: number
  videoSections: VideoSection[]
  linkCopied: boolean
  onClose: () => void
  onStartExport: (roomId: string, settings: ExportSettings) => void
  onCancelExport: () => void
  onDownloadVideo: () => void
  onCopyDownloadLink: () => Promise<boolean>
  onResetExport: () => void
  onLinkCopiedChange: (copied: boolean) => void
  roomId: string
}

export function ExportModal({
  isOpen,
  isExporting,
  exportStatus,
  duration,
  videoSections,
  linkCopied,
  onClose,
  onStartExport,
  onCancelExport,
  onDownloadVideo,
  onCopyDownloadLink,
  onResetExport,
  onLinkCopiedChange,
  roomId
}: ExportModalProps) {
  if (!isOpen) return null

  const handleCopyLink = async () => {
    const success = await onCopyDownloadLink()
    if (success) {
      onLinkCopiedChange(true)
      setTimeout(() => onLinkCopiedChange(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Esporta Video
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isExporting}
          >
            ✕
          </button>
        </div>

        {isExporting || exportStatus.stage === 'completed' ? (
          <div className="space-y-4">
            {exportStatus.stage !== 'completed' && (
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                <span className="text-sm text-gray-600">
                  {exportStatus.message}
                </span>
              </div>
            )}

            {exportStatus.stage !== 'completed' && (
              <>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${exportStatus.percentage}%` }}
                  ></div>
                </div>

                <div className="text-center">
                  <p className="text-sm text-gray-500 mb-3">
                    {exportStatus.percentage}% completato
                  </p>
                  <Button onClick={onCancelExport} variant="outline" size="sm">
                    Annulla
                  </Button>
                </div>
              </>
            )}

            {exportStatus.stage === "completed" &&
              exportStatus.downloadUrl && (
                <div className="text-center pt-4 border-t">
                  <p className="text-green-600 mb-4">
                    ✅ Export completato con successo!
                  </p>

                  <div className="space-y-3">
                    <Button
                      onClick={() => {
                        onDownloadVideo()
                        onClose()
                        onResetExport()
                      }}
                      variant="secondary"
                      className="w-full"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Scarica Video
                    </Button>

                    <Button
                      onClick={handleCopyLink}
                      variant="outline"
                      className="w-full"
                    >
                      {linkCopied ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                          Link Copiato!
                        </>
                      ) : (
                        <>
                          <Link className="h-4 w-4 mr-2" />
                          Copia Link Download
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={() => {
                        onClose()
                        onResetExport()
                      }}
                      variant="ghost"
                      size="sm"
                    >
                      Chiudi
                    </Button>
                  </div>
                </div>
              )}

            {exportStatus.stage === "failed" && (
              <div className="text-center pt-4 border-t">
                <p className="text-red-600 mb-2">❌ Export fallito</p>
                <p className="text-sm text-gray-500 mb-3">
                  {exportStatus.error}
                </p>
                <Button
                  onClick={() => {
                    onClose()
                    onResetExport()
                  }}
                  variant="outline"
                >
                  Chiudi
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Qualità Video
              </label>
              <select className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                <option value="720p">720p (Recommended)</option>
                <option value="1080p">1080p (High Quality)</option>
                <option value="4k">4K (Premium)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Formato
              </label>
              <select className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                <option value="mp4">MP4 (Recommended)</option>
                <option value="webm">WebM</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="includeSubtitles"
                defaultChecked
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <label
                htmlFor="includeSubtitles"
                className="text-sm text-gray-700"
              >
                Includi sottotitoli
              </label>
            </div>

            <div className="bg-gray-50 p-3 rounded-md">
              <div className="text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Durata originale:</span>
                  <span>
                    {Math.floor(duration / 60)}:
                    {(duration % 60).toFixed(0).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Durata finale:</span>
                  <span>
                    {Math.floor(
                      videoSections
                        .filter((s) => !s.isDeleted)
                        .reduce(
                          (acc, s) => acc + (s.endTime - s.startTime),
                          0
                        ) / 60
                    )}
                    :
                    {(
                      videoSections
                        .filter((s) => !s.isDeleted)
                        .reduce(
                          (acc, s) => acc + (s.endTime - s.startTime),
                          0
                        ) % 60
                    )
                      .toFixed(0)
                      .padStart(2, "0")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Sezioni eliminate:</span>
                  <span>
                    {videoSections.filter((s) => s.isDeleted).length}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Annulla
              </Button>
              <Button
                onClick={() => {
                  const settings: ExportSettings = {
                    format: "mp4",
                    quality: "720p",
                    framerate: 30,
                    includeSubtitles: true,
                  }
                  onStartExport(roomId, settings)
                }}
                className="flex-1"
                variant="secondary"
              >
                <Download className="h-4 w-4 mr-2" />
                Inizia Export
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}