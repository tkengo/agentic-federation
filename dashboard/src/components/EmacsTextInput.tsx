import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import chalk from "chalk";
import stringWidth from "string-width";

interface EmacsTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  showCursor?: boolean;
}

// Walk up the Yoga node tree to calculate absolute position within Ink's layout.
// Each node's getComputedLeft/Top is relative to its parent, so summing them
// gives the absolute position in Ink's coordinate system.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAbsolutePosition(node: any): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let current = node;
  while (current) {
    if (current.yogaNode) {
      x += current.yogaNode.getComputedLeft();
      y += current.yogaNode.getComputedTop();
    }
    current = current.parentNode;
  }
  return { x, y };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boxRef = useRef<any>(null);

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

  // Position the real terminal cursor at the text input cursor for IME support.
  // The dashboard runs in alternate screen buffer with height={rows}, so Ink's
  // Yoga coordinate (x, y) maps directly to terminal position (col+1, row+1).
  // useLayoutEffect runs synchronously after Ink writes output to stdout,
  // ensuring the cursor is positioned before the next user input.
  useLayoutEffect(() => {
    if (!focus || !showCursor) return;
    const node = boxRef.current;
    if (!node) return;
    const { x, y } = getAbsolutePosition(node);
    const textBeforeCursor = originalValue.slice(0, cursorOffset);
    const col = x + stringWidth(textBeforeCursor) + 1; // ANSI is 1-indexed
    const row = y + 1;
    // Move cursor to position and make it visible
    process.stdout.write(`\x1b[${row};${col}H\x1b[?25h`);
  });

  // Hide terminal cursor when losing focus or unmounting
  useEffect(() => {
    if (!focus) return;
    return () => {
      process.stdout.write("\x1b[?25l");
    };
  }, [focus]);

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
    <Box ref={boxRef}>
      <Text>
        {placeholder
          ? value.length > 0 ? renderedValue : renderedPlaceholder
          : renderedValue}
      </Text>
    </Box>
  );
}
