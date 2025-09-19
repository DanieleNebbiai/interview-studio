"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProcessingLoader } from "@/components/processing/ProcessingLoader";
import { ProcessingHeader } from "@/components/processing/ProcessingHeader";
import { ProcessingError } from "@/components/processing/ProcessingError";
import { ProcessingSteps } from "@/components/processing/ProcessingSteps";
import { ProcessingProgress } from "@/components/processing/ProcessingProgress";
import { ProcessingActions } from "@/components/processing/ProcessingActions";

interface RecordingInstance {
  instanceId: string;
  roomName: string;
  sessionId: string;
  startTime: string;
  status: string;
}

interface ProcessingStep {
  id: string;
  name: string;
  status: "pending" | "processing" | "completed" | "error";
  message?: string;
}

interface ProcessingData {
  roomId: string;
  roomName: string;
  recordings: RecordingInstance[];
  hadRecordingsSession?: boolean;
}

export default function ProcessingPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [processingData, setProcessingData] = useState<ProcessingData | null>(
    null
  );
  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: "fetch",
      name: "Scaricamento registrazioni da Daily.co",
      status: "pending",
    },
    {
      id: "transcribe",
      name: "Trascrizione con OpenAI Whisper",
      status: "pending",
    },
    {
      id: "waveform",
      name: "Estrazione dati waveform audio",
      status: "pending",
    },
    {
      id: "ai-edit",
      name: "Analisi AI per editing automatico",
      status: "pending",
    },
    { id: "save", name: "Salvataggio su Supabase", status: "pending" },
    { id: "complete", name: "Processing completato", status: "pending" },
  ]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processingStarted = useRef(false);

  useEffect(() => {
    // Only run once when component mounts
    if (processingStarted.current || isProcessing) return; // Prevent duplicate calls

    // Recupera i dati di processing dal sessionStorage
    const storedData = sessionStorage.getItem("processingData");
    if (storedData) {
      const data: ProcessingData = JSON.parse(storedData);
      console.log("Processing data from sessionStorage:", data);
      console.log(
        "Recordings to process:",
        data.recordings?.map((r) => ({
          instanceId: r.instanceId,
          sessionId: r.sessionId,
          roomName: r.roomName,
        }))
      );

      setProcessingData(data);
      processingStarted.current = true;
      // Inizia automaticamente il processing
      startProcessing(data);
    } else {
      console.error("No processing data found in sessionStorage");
      setError("Dati di processing non trovati");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once

  const updateStep = (
    stepId: string,
    status: ProcessingStep["status"],
    message?: string
  ) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status, message } : step
      )
    );
  };

  const waitForRoomRecordings = async (roomId: string) => {
    const maxAttempts = 20; // 10 minuti massimo (30s per tentativo)
    const delayBetweenAttempts = 30000; // 30 secondi

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(
          `Polling attempt ${attempt}/${maxAttempts} for room recordings...`
        );
        updateStep(
          "fetch",
          "processing",
          `Controllo registrazioni room (tentativo ${attempt}/${maxAttempts})...`
        );

        // Call API that searches by room name only
        const fetchResponse = await fetch("/api/recordings/fetch-by-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: roomId,
          }),
        });

        if (!fetchResponse.ok) {
          throw new Error("Errore durante il controllo delle registrazioni");
        }

        const fetchData = await fetchResponse.json();

        // Se abbiamo registrazioni finished, le ritorniamo
        if (fetchData.downloadedCount > 0) {
          console.log(
            `Found ${fetchData.downloadedCount} finished recordings after ${attempt} attempts`
          );
          return fetchData;
        }

        // Se è l'ultimo tentativo, ritorniamo l'errore/vuoto
        if (attempt === maxAttempts) {
          console.log("Max polling attempts reached");
          return fetchData;
        }

        // Aspetta prima del prossimo tentativo
        console.log(
          `No finished recordings found, waiting ${
            delayBetweenAttempts / 1000
          }s before next attempt...`
        );
        updateStep(
          "fetch",
          "processing",
          `Registrazioni ancora in processing, riprovo tra 30 secondi... (${attempt}/${maxAttempts})`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenAttempts)
        );
      } catch (error) {
        console.error(`Error in polling attempt ${attempt}:`, error);

        if (attempt === maxAttempts) {
          throw error;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenAttempts)
        );
      }
    }

    throw new Error("Timeout waiting for recordings to be ready");
  };

  const startProcessing = async (data: ProcessingData) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Step 1: Find finished recordings for this room
      updateStep(
        "fetch",
        "processing",
        "Cercando registrazioni per questa room..."
      );

      const fetchData = await waitForRoomRecordings(data.roomId);

      if (fetchData.downloadedCount === 0 && fetchData.errors) {
        // Show specific error messages
        const errorMsg = fetchData.errors.join(". ");
        updateStep("fetch", "error", errorMsg);
        throw new Error(`Nessuna registrazione disponibile: ${errorMsg}`);
      }

      updateStep(
        "fetch",
        "completed",
        `${fetchData.downloadedCount} registrazioni scaricate`
      );
      setCurrentStep(1);

      // Step 2: Transcribe
      updateStep(
        "transcribe",
        "processing",
        `Trascrizione di ${fetchData.recordings.length} registrazioni in corso... (può richiedere alcuni minuti)`
      );

      // Create AbortController with extended timeout for large files
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 300000); // 5 minutes timeout

      // Show progress updates during transcription
      const progressInterval = setInterval(() => {
        updateStep(
          "transcribe",
          "processing",
          `Trascrizione in corso... OpenAI sta processando ${fetchData.recordings.length} file (operazione lunga)`
        );
      }, 10000); // Update every 10 seconds

      let transcribeResponse;
      try {
        transcribeResponse = await fetch("/api/recordings/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: data.roomId,
            recordings: fetchData.recordings,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        clearInterval(progressInterval);

        if (!transcribeResponse.ok) {
          const errorText = await transcribeResponse.text();
          console.error("Transcribe API error:", errorText);
          throw new Error(
            `Errore durante la trascrizione: ${transcribeResponse.status}`
          );
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error(
            "Timeout durante la trascrizione - il file potrebbe essere troppo grande"
          );
        }
        throw fetchError;
      }

      const transcribeData = await transcribeResponse.json();
      updateStep(
        "transcribe",
        "completed",
        `${transcribeData.transcriptionsCount} trascrizioni completate`
      );
      setCurrentStep(2);

      // Step 3: Waveform Processing
      updateStep(
        "waveform",
        "processing",
        `Estrazione waveform da ${transcribeData.recordings.length} file audio...`
      );

      const waveformResponse = await fetch("/api/recordings/waveform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: data.roomId,
          recordings: transcribeData.recordings,
        }),
      });

      if (!waveformResponse.ok) {
        throw new Error("Errore durante l'estrazione waveform");
      }

      const waveformData = await waveformResponse.json();
      updateStep(
        "waveform",
        "completed",
        `Waveform estratto per ${waveformData.processedCount} registrazioni`
      );
      setCurrentStep(3);

      // Step 4: AI Editing Analysis (TEMPORARILY DISABLED)
      console.log("AI editing step skipped - temporarily disabled");
      updateStep(
        "ai-edit",
        "completed",
        "AI editing disabilitato temporaneamente - focus segments gestiti manualmente"
      );

      setCurrentStep(4);

      // Step 5: Save to Supabase
      updateStep("save", "processing", "Salvataggio dati...");

      const saveResponse = await fetch("/api/recordings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: data.roomId,
          recordings: transcribeData.recordings, // Now includes start_ts from Daily.co
          transcriptions: transcribeData.transcriptions,
          waveforms: waveformData.waveforms,
          // aiEditingResult: transcribeData.aiEditingResult, // DISABLED - AI-generated focus segments
        }),
      });

      if (!saveResponse.ok) {
        throw new Error("Errore durante il salvataggio");
      }

      updateStep("save", "completed", "Dati salvati su database");
      setCurrentStep(5);

      // Step 6: Complete
      updateStep(
        "complete",
        "completed",
        "Processing completato con successo!"
      );

      // Clear session storage
      sessionStorage.removeItem("processingData");
    } catch (error) {
      console.error("Processing error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      setError(errorMessage);

      // Mark current step as error
      if (currentStep < steps.length) {
        updateStep(steps[currentStep].id, "error", errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const goHome = () => {
    router.push("/");
  };

  const goToEditor = () => {
    router.push(`/edit/${roomId}`);
  };

  if (!processingData && !error) {
    return <ProcessingLoader />;
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="bg-accent rounded-2xl shadow-lg p-8">
            <ProcessingHeader roomId={roomId} />

            {error && <ProcessingError error={error} />}

            <ProcessingSteps steps={steps} />

            <ProcessingProgress
              currentStep={currentStep}
              totalSteps={steps.length}
              isProcessing={isProcessing}
            />

            <ProcessingActions
              isCompleted={steps[steps.length - 1].status === "completed"}
              onGoHome={goHome}
              onGoToEditor={goToEditor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
