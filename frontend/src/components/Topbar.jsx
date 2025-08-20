import React from "react";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-orange-200">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/surfari-initial.png"
            alt="Surfari"
            className="h-9 w-9 rounded-full shadow"
          />
          <span className="font-bold text-orange-700">Surfari Admin</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
            v0.1
          </span>
        </div>
      </div>
    </header>
  );
}
