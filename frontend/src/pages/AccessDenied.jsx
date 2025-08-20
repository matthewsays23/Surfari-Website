import React from "react";
import { XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-rose-100 to-orange-100">
      <div className="text-center space-y-4 px-4">
        <XCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h1 className="text-2xl font-bold text-red-700">Access Denied</h1>
        <p className="text-gray-600 max-w-md mx-auto">
          You must be an admin in the <strong>Surfari</strong> Roblox group to access this panel.
        </p>
        <button
          onClick={() => (window.location.href = "https://surfari.onrender.com/auth/roblox")}
          className="mt-4 px-6 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition"
        >
          Retry Login
        </button>
      </div>
    </div>
  );
}
