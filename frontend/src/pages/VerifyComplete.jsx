// src/pages/VerifyComplete.jsx
import VerificationScreen from "../components/VerificationScreen";

export default function VerifyComplete() {
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") || "discord";        // "discord" | "site"
  const autoCloseMs = Number(params.get("autoCloseMs") || 0);
  const returnTo = params.get("returnTo") || undefined; // optional Discord jump link

  return (
    <VerificationScreen
      initial="verifying"
      mode={mode}
      autoAdvanceMs={1200}
      autoCloseMs={autoCloseMs}
      discordReturnUrl={returnTo}
    />
  );
}
