import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react"; // Optional loading spinner icon

export default function AuthSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  console.log("AuthSuccess token:", token); // DEBUG LINE

  if (token) {
    localStorage.setItem("surfari_token", token);
    setTimeout(() => navigate("/"), 1500);
  } else {
    navigate("/access-denied");
  }
}, []);


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-100 via-amber-50 to-emerald-100">
      <div className="text-center space-y-4">
        <img
          src="/surfari-initial.png"
          alt="Surfari Logo"
          className="w-16 h-16 mx-auto drop-shadow-md"
        />
        <h1 className="text-xl font-semibold text-orange-800">Authenticating...</h1>
        <p className="text-gray-600">Please wait while we sign you in.</p>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-orange-500" />
      </div>
    </div>
  );
}
