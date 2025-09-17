"use client";

export function LoadingState() {
  return (
    <div className="min-h-screen bg-background items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}
