"use client";

import { CheckCircle, Clock, AlertCircle } from "lucide-react";

interface ProcessingStep {
  id: string;
  name: string;
  status: "pending" | "processing" | "completed" | "error";
  message?: string;
}

interface ProcessingStepsProps {
  steps: ProcessingStep[];
}

export function ProcessingSteps({ steps }: ProcessingStepsProps) {
  const getStepIcon = (step: ProcessingStep) => {
    switch (step.status) {
      case "completed":
        return <CheckCircle className="h-6 w-6 text-primary" />;
      case "processing":
        return <Clock className="h-6 w-6 text-foreground animate-spin" />;
      case "error":
        return <AlertCircle className="h-6 w-6 text-destructive" />;
      default:
        return <div className="h-6 w-6 border-2 border-border rounded-full" />;
    }
  };

  const getStepBackgroundClass = (status: ProcessingStep["status"]) => {
    switch (status) {
      case "completed":
        return "bg--accent";
      case "processing":
        return "bg-muted";
      case "error":
        return "bg-destruptive";
      default:
        return "bg-background";
    }
  };

  return (
    <div className="space-y-4 mb-8">
      {steps.map((step) => (
        <div
          key={step.id}
          className={`flex items-center space-x-4 p-4 rounded-lg ${getStepBackgroundClass(
            step.status
          )}`}
        >
          {getStepIcon(step)}
          <div className="flex-1">
            <h3 className="font-medium text-foreground">{step.name}</h3>
            {step.message && (
              <p className="text-sm text-muted-foreground">{step.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
