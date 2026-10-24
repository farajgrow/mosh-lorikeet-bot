"use client";

import { useEffect, useRef } from "react";

/** Calls fn immediately and then every `ms` while the tab is visible. Pass ms=null to pause. */
export function usePolling(fn: () => void | Promise<void>, ms: number | null) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (ms === null) return;
    let stopped = false;
    const tick = () => {
      if (!stopped && document.visibilityState !== "hidden") void ref.current();
    };
    tick();
    const id = window.setInterval(tick, ms);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [ms]);
}
