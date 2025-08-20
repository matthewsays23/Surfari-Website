import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function AccessGate({ children }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("surfari_token");
    console.log("AccessGate token:", token);

    if (!token) {
      window.location.href = "https://surfari.onrender.com/auth/roblox";
      return;
    }

    fetch("https://surfari.onrender.com/auth/verify", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async res => {
        const contentType = res.headers.get("content-type");

        if (!res.ok) {
          const error = contentType?.includes("application/json")
            ? await res.json()
            : await res.text();

          throw new Error(error?.error || error || "Unknown error");
        }

        return contentType?.includes("application/json")
          ? res.json()
          : Promise.reject("Unexpected non-JSON response");
      })
      .then(() => setLoading(false))
      .catch(err => {
        console.error("Verify error:", err.message || err);
        localStorage.removeItem("surfari_token");
        navigate("/access-denied");
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-100 via-amber-50 to-emerald-100">
        <div className="text-center space-y-4">
          <img
            src="/surfari-initial.png"
            alt="Surfari Logo"
            className="w-16 h-16 mx-auto drop-shadow-md"
          />
          <h1 className="text-xl font-semibold text-orange-800">Checking Access...</h1>
          <p className="text-gray-600">Verifying your admin status. Hang tight.</p>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-orange-500" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
