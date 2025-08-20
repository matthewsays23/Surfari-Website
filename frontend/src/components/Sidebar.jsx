import React from "react";
import { Home, ClipboardList, Users, Activity, Shield, Store, LogOut } from "lucide-react";

const tabs = [
  { id: "home", label: "Home", icon: Home },
  { id: "sessions", label: "Sessions", icon: ClipboardList },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "moderation", label: "Moderation", icon: Shield },
  { id: "orders", label: "Orders", icon: Store },
  { id: "team", label: "Team", icon: Users }, // ✅ was `key`, should be `id`
];

export default function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside className="w-64 bg-gradient-to-b from-orange-50 to-emerald-50 border-r border-orange-200 h-screen p-5 flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 mb-8">
        <img src="/surfari-initial.png" alt="S" className="h-9 w-9 rounded-full shadow" />
        <span className="text-xl font-bold text-orange-700">Surfari</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl transition
              ${activeTab === t.id ? "bg-orange-500 text-white shadow" : "text-orange-800 hover:bg-orange-200/70"}`}
          >
            <t.icon className="w-5 h-5" />
            {t.label}
          </button>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={() => {
          localStorage.removeItem("surfari_token"); // ✅ clear actual auth token
          window.location.href = "https://surfari.onrender.com/auth/roblox"; // optional: force reauth
        }}
        className="mt-6 flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700"
      >
        <LogOut className="w-4 h-4" />
        Log out
      </button>
    </aside>
  );
}
