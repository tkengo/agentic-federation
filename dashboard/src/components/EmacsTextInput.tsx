import React, { useState, useEffect } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";

interface EmacsTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  showCursor?: boolean;
}

// TextInput with emacs-style keybindings (readline emulation).
// Ctrl+B/F: cursor left/right, Ctrl+A/E: home/end,
// Ctrl+W: delete word backward, Ctrl+U/K: kill line,
// Ctrl+H: backspace, Ctrl+D: delete forward.
// Unknown ctrl combos (including Ctrl+N/P/C) are ignored
// so parent components can handle them.
export function EmacsTextInput({
  value: originalValue,
  onChange,
  onSubmit,
  placeholder = "",
  focus = true,
  showCursor = true,
}: EmacsTextInputProps) {
  const [cursorOffset, setCursorOffset] = useState(originalValue.length);

  useEffect(() => {
    if (cursorOffset > originalValue.length) {
      setCursorOffset(originalValue.length);
    }
  }, [originalValue, cursorOffset]);

  useInput((input, key) => {
    // Let parent handle these
    if (key.upArrow || key.downArrow || key.tab || (key.shift && key.tab) || key.escape) {
      return;
    }

    if (key.return) {
      onSubmit?.(originalValue);
      return;
    }

    let nextValue = originalValue;
    let nextCursor = cursorOffset;

    if (key.ctrl) {
      switch (input) {
        case "b": // cursor left
          nextCursor = Math.max(0, cursorOffset - 1);
          break;
        case "f": // cursor right
          nextCursor = Math.min(originalValue.length, cursorOffset + 1);
          break;
        case "a": // beginning of line
          nextCursor = 0;
          break;
        case "e": // end of line
          nextCursor = originalValue.length;
          break;
        case "w": { // delete word backward
          const before = originalValue.slice(0, cursorOffset);
          const trimmed = before.replace(/\s+$/, "");
          const wordStart = trimmed.search(/\S+$/);
          const deleteFrom = wordStart === -1 ? 0 : wordStart;
          nextValue = originalValue.slice(0, deleteFrom) + originalValue.slice(cursorOffset);
          nextCursor = deleteFrom;
          break;
        }
        case "u": // delete to beginning of line
          nextValue = originalValue.slice(cursorOffset);
          nextCursor = 0;
          break;
        case "k": // delete to end of line
          nextValue = originalValue.slice(0, cursorOffset);
          break;
        case "h": // backspace
          if (cursorOffset > 0) {
            nextValue = originalValue.slice(0, cursorOffset - 1) + originalValue.slice(cursorOffset);
            nextCursor = cursorOffset - 1;
          }
          break;
        case "d": // delete forward
          if (cursorOffset < originalValue.length) {
            nextValue = originalValue.slice(0, cursorOffset) + originalValue.slice(cursorOffset + 1);
          }
          break;
        default:
          // Ignore unknown ctrl combos (ctrl+n, ctrl+p, ctrl+c, etc.)
          return;
      }
    } else if (key.leftArrow) {
      nextCursor = Math.max(0, cursorOffset - 1);
    } else if (key.rightArrow) {
      nextCursor = Math.min(originalValue.length, cursorOffset + 1);
    } else if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        nextValue = originalValue.slice(0, cursorOffset - 1) + originalValue.slice(cursorOffset);
        nextCursor = cursorOffset - 1;
      }
    } else {
      // Regular character input
      nextValue = originalValue.slice(0, cursorOffset) + input + originalValue.slice(cursorOffset);
      nextCursor = cursorOffset + input.length;
    }

    nextCursor = Math.max(0, Math.min(nextCursor, nextValue.length));
    setCursorOffset(nextCursor);
    if (nextValue !== originalValue) {
      onChange(nextValue);
    }
  }, { isActive: focus });

  // Render
  const value = originalValue;
  let renderedValue: string = value;
  let renderedPlaceholder: string | undefined = placeholder ? chalk.grey(placeholder) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(" ");

    renderedValue = value.length > 0 ? "" : chalk.inverse(" ");
    let i = 0;
    for (const char of value) {
      renderedValue += i === cursorOffset ? chalk.inverse(char) : char;
      i++;
    }
    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(" ");
    }
  }

  return (
    <Text>
      {placeholder
        ? value.length > 0 ? renderedValue : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}
