"use client";

import { useEffect, useRef } from "react";
import { initCapacitorPush, registerPushActionListener } from "@/lib/capacitor-push";
import { hapticLightImpact } from "@/lib/haptics";

/**
 * Registers push action listener on load (for deep link on cold start).
 * Requests APNs permission and initializes push only after the user's first
 * interaction (tap/click), per App Store guidelines.
 */
export function PushOnFirstInteraction() {
  const done = useRef(false);

  useEffect(() => {
    registerPushActionListener();
  }, []);

  useEffect(() => {
    if (done.current) return;

    const run = async () => {
      done.current = true;
      try {
        await initCapacitorPush();
        // Haptic on successful permission request (haptic also triggered inside init when granted)
        hapticLightImpact().catch(() => {});
      } catch {
        // Silent failure
      }
    };

    const onInteraction = () => {
      if (done.current) return;
      run();
      remove();
    };

    const remove = () => {
      window.removeEventListener("click", onInteraction, true);
      window.removeEventListener("touchstart", onInteraction, true);
      document.removeEventListener("keydown", onInteraction, true);
    };

    window.addEventListener("click", onInteraction, true);
    window.addEventListener("touchstart", onInteraction, true);
    document.addEventListener("keydown", onInteraction, true);

    return remove;
  }, []);

  return null;
}
