'use client'

import { Button } from "@/components/ui/button"
import { Video } from "lucide-react"
import Link from "next/link"

export function ViewRecordingsButton() {
  return (
    <div className="mb-8 text-center">
      <Link href="/recordings">
        <Button variant="outline">
          <Video className="h-4 w-4 mr-2" />
          Visualizza Registrazioni
        </Button>
      </Link>
    </div>
  )
}