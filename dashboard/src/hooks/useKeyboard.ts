import { useInput } from "ink";

export interface KeyboardActions {
  onEnter?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onPreview?: () => void;
  onApprove?: () => void;
  onFeedback?: () => void;
  onLongFeedback?: () => void;
  onStop?: () => void;
  onQuit?: () => void;
  onBack?: () => void;
  onCreate?: () => void;
  onPalette?: () => void;
}

export function useKeyboard(actions: KeyboardActions, active = true) {
  useInput(
    (input, key) => {
      if (key.return) {
        actions.onEnter?.();
      } else if (key.upArrow || input === "k") {
        actions.onUp?.();
      } else if (key.downArrow || input === "j") {
        actions.onDown?.();
      } else if (input === "p") {
        actions.onPreview?.();
      } else if (input === "a") {
        actions.onApprove?.();
      } else if (input === "f") {
        actions.onFeedback?.();
      } else if (input === "F") {
        actions.onLongFeedback?.();
      } else if (input === "s") {
        actions.onStop?.();
      } else if (input === "n") {
        actions.onCreate?.();
      } else if (input === ":") {
        actions.onPalette?.();
      } else if (input === "q") {
        actions.onQuit?.();
      } else if (key.escape) {
        actions.onBack?.();
      }
    },
    { isActive: active }
  );
}
