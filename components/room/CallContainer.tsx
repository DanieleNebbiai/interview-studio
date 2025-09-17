'use client'

import { useRef, useEffect } from 'react'
import { DailyCall } from '@daily-co/daily-js'

interface CallContainerProps {
  callFrame: DailyCall | null
}

export function CallContainer({ callFrame }: CallContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && callFrame && !containerRef.current.hasChildNodes()) {
      const iframe = callFrame.iframe()
      if (iframe) {
        iframe.style.width = "100%"
        iframe.style.height = "100%"
        iframe.style.border = "none"
        containerRef.current.appendChild(iframe)
      }
    }
  }, [callFrame])

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full absolute inset-0"
      />
    </div>
  )
}