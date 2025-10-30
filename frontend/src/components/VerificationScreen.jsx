// src/components/VerificationScreen.jsx
import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function VerificationScreen({
  initial = "verifying",          // "verifying" | "success" | "error"
  title = "Verifying your account...",
  subtitle = "Hang tight while we sync your Surfari roles.",
  successTitle = "Verified!",
  successSubtitle = "You’re all set — return to Discord to finish up.",
  errorTitle = "Something went wrong",
  errorSubtitle = "Please close this tab and try again.",
  mode = "discord",               // "discord" | "site"
  autoAdvanceMs = 1200,           // how long to show the spinner before success
  autoCloseMs = 0,                // if >0, window closes after success
  discordReturnUrl,               // optional: link back to your server or Discord channel
  className = "",
}) {
  const [state, setState] = useState(initial);

  // Label customizations by mode
  const labels = useMemo(() => {
    if (mode === "discord") {
      return {
        verifyingTitle: title ?? "Verifying your Discord link…",
        verifyingSubtitle: subtitle ?? "Checking your Surfari roles.",
        doneTitle: successTitle ?? "✅ Verified!",
        doneSubtitle: successSubtitle ?? "You can return to Discord now.",
      };
    }
    return {
      verifyingTitle: title ?? "Checking access…",
      verifyingSubtitle: subtitle ?? "Signing you into Surfari.",
      doneTitle: successTitle ?? "Welcome!",
      doneSubtitle: successSubtitle ?? "You’re signed in.",
    };
  }, [mode, title, subtitle, successTitle, successSubtitle]);

  useEffect(() => {
    if (state !== "verifying") return;
    const t = setTimeout(() => setState("success"), autoAdvanceMs);
    return () => clearTimeout(t);
  }, [state, autoAdvanceMs]);

  useEffect(() => {
    if (state === "success" && autoCloseMs > 0) {
      const t = setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, autoCloseMs);
      return () => clearTimeout(t);
    }
  }, [state, autoCloseMs]);

  const isSuccess = state === "success";
  const isError = state === "error";

  return (
    <div
      className={[
        "min-h-screen flex items-center justify-center",
        "bg-gradient-to-br from-orange-100 via-amber-50 to-emerald-100",
        className,
      ].join(" ")}
    >
      <div className="w-full max-w-md mx-auto">
        <div className="mx-4 rounded-2xl bg-white/90 backdrop-blur-md shadow-xl p-8 text-center">
          <img
            src="/surfari-initial.png"
            alt="Surfari Logo"
            className="w-16 h-16 mx-auto mb-4 drop-shadow-md rounded-full"
          />

          {/* Status Icon */}
          <div className="h-10 flex items-center justify-center mb-2">
            {isSuccess ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-600 animate-in fade-in zoom-in" />
            ) : isError ? (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold">
                !
              </span>
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            )}
          </div>

          {/* Titles */}
          <h1 className="text-xl font-semibold text-orange-800">
            {isSuccess
              ? labels.doneTitle
              : isError
              ? errorTitle
              : labels.verifyingTitle}
          </h1>
          <p className="text-gray-600 mt-1">
            {isSuccess
              ? labels.doneSubtitle
              : isError
              ? errorSubtitle
              : labels.verifyingSubtitle}
          </p>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-center gap-3">
            {isSuccess ? (
              <>
                {mode === "discord" && (
                  <a
                    href={discordReturnUrl || "https://discord.com/app"}
                    className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 transition"
                  >
                    Return to Discord
                  </a>
                )}
                <button
                  onClick={() => {
                    try {
                      window.close();
                    } catch {}
                  }}
                  className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 transition"
                >
                  Close
                </button>
              </>
            ) : isError ? (
              <button
                onClick={() => location.reload()}
                className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition"
              >
                Try Again
              </button>
            ) : null}
          </div>
        </div>

        {/* Subtle footer */}
        <div className="text-center text-xs text-orange-900/60 mt-4">
          Surfari • 2025
        </div>
      </div>
    </div>
  );
}
