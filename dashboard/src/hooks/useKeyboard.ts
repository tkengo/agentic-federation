import { useInput } from "ink";

export interface KeyboardActions {
  onEnter?: () => void;
  onUp?: () => void;
  onDown?: () => void;

  onTabNext?: () => void;
  onTabPrev?: () => void;
  onStop?: () => void;
  onClean?: () => void;
  onQuit?: () => void;
  onBack?: () => void;
  onAdd?: () => void;
  onPalette?: () => void;
  onSpace?: () => void;
}

export function useKeyboard(actions: KeyboardActions, active = true) {
  useInput(
    (input, key) => {
      // Tab / Shift+Tab for tab switching (must be checked first)
      if (key.tab && key.shift) {
        actions.onTabPrev?.();
      } else if (key.tab) {
        actions.onTabNext?.();
      // Ctrl+N/P for up/down navigation (takes priority)
      } else if (key.ctrl && input === "p") {
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
      } else if (input === "a") {
        actions.onAdd?.();
      } else if (input === "c") {
        actions.onClean?.();
      } else if (input === "d") {
        actions.onStop?.();
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
