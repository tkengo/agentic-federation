import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { FooterOverride } from "../utils/types.js";

// --- Types ---

export interface FooterState {
  message: string | null;
  messageColor: "green" | "red";
  override: FooterOverride;
  ctrlCPending: boolean;
}

interface FooterContextValue {
  state: FooterState;
  showMessage: (msg: string, duration?: number) => void;
  showError: (msg: string, duration?: number) => void;
  setOverride: (override: FooterOverride) => void;
  clearOverride: () => void;
  setCtrlCPending: (pending: boolean) => void;
}

// --- Context ---

const FooterContext = createContext<FooterContextValue | null>(null);

// --- Provider ---

const DEFAULT_MESSAGE_DURATION = 3000;
const DEFAULT_ERROR_DURATION = 5000;

export function FooterProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [messageColor, setMessageColor] = useState<"green" | "red">("green");
  const [override, setOverrideState] = useState<FooterOverride>(null);
  const [ctrlCPending, setCtrlCPendingState] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showMessage = useCallback((msg: string, duration = DEFAULT_MESSAGE_DURATION) => {
    clearTimer();
    setMessage(msg);
    setMessageColor("green");
    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, duration);
  }, [clearTimer]);

  const showError = useCallback((msg: string, duration = DEFAULT_ERROR_DURATION) => {
    clearTimer();
    setMessage(msg);
    setMessageColor("red");
    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, duration);
  }, [clearTimer]);

  const setOverride = useCallback((o: FooterOverride) => {
    setOverrideState(o);
  }, []);

  const clearOverride = useCallback(() => {
    setOverrideState(null);
  }, []);

  const setCtrlCPending = useCallback((pending: boolean) => {
    setCtrlCPendingState(pending);
  }, []);

  const state: FooterState = { message, messageColor, override, ctrlCPending };

  const value: FooterContextValue = {
    state,
    showMessage,
    showError,
    setOverride,
    clearOverride,
    setCtrlCPending,
  };

  return (
    <FooterContext.Provider value={value}>
      {children}
    </FooterContext.Provider>
  );
}

// --- Hook ---

export function useFooter(): FooterContextValue {
  const ctx = useContext(FooterContext);
  if (!ctx) {
    throw new Error("useFooter must be used within a FooterProvider");
  }
  return ctx;
}
