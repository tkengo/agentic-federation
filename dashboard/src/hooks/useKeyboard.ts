import { useInput } from "ink";

export interface KeyboardActions {
  onEnter?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onPreview?: () => void;
  onFeedback?: () => void;
  onLongFeedback?: () => void;
  onStop?: () => void;
  onQuit?: () => void;
  onBack?: () => void;
  onCreate?: () => void;
  onPalette?: () => void;
  onSpace?: () => void;
  onAddRepo?: () => void;
}

export function useKeyboard(actions: KeyboardActions, active = true) {
  useInput(
    (input, key) => {
      // Ctrl+N/P for up/down navigation (takes priority)
      if (key.ctrl && input === "p") {
        actions.onUp?.();
      } else if (key.ctrl && input === "n") {
        actions.onDown?.();
      } else if (key.ctrl) {
        // Ignore other ctrl combos to avoid triggering single-key actions
      } else if (key.return) {
        actions.onEnter?.();
      } else if (key.upArrow || input === "k") {
        actions.onUp?.();
      } else if (key.downArrow || input === "j") {
        actions.onDown?.();
      } else if (input === "p") {
        actions.onPreview?.();
      } else if (input === "a") {
        actions.onAddRepo?.();
      } else if (input === "f") {
        actions.onFeedback?.();
      } else if (input === "F") {
        actions.onLongFeedback?.();
      } else if (input === "d") {
        actions.onStop?.();
      } else if (input === "n") {
        actions.onCreate?.();
      } else if (input === ":") {
        actions.onPalette?.();
      } else if (input === " ") {
        actions.onSpace?.();
      } else if (input === "q") {
        actions.onQuit?.();
      } else if (key.escape) {
        actions.onBack?.();
      }
    },
    { isActive: active }
  );
}
