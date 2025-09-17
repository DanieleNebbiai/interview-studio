"use client";

interface ProcessingHeaderProps {
  roomId: string;
}

export function ProcessingHeader({ roomId }: ProcessingHeaderProps) {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold text-foreground mb-4">
        Processing Registrazioni
      </h1>
    </div>
  );
}
