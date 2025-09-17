"use client";

export function LoadingState() {
  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-400 mx-auto mb-4"></div>
        <h2 className="text-white text-xl">Creazione room in corso...</h2>
      </div>
    </div>
  );
}
