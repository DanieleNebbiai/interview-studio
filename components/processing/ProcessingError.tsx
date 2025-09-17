"use client";

import { AlertCircle } from "lucide-react";

interface ProcessingErrorProps {
  error: string;
}

export function ProcessingError({ error }: ProcessingErrorProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <div className="flex items-center space-x-2">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <span className="text-destructive font-medium">Errore</span>
      </div>
      <p className="text-destructive mt-1">{error}</p>
    </div>
  );
}
