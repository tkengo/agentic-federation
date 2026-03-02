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

  // Stores the ANSI escape sequence to reposition cursor.
  // Updated by useLayoutEffect on every render, read by the stdout interceptor.
  const cursorSeqRef = useRef<string | null>(null);

  // Intercept process.stdout.write to reposition cursor after EVERY write.
  //
  // Why this is needed:
  // Ink's onRender (the actual stdout write) is throttled (~32ms).  When the
  // throttled trailing call fires, it writes screen content to stdout AFTER
  // our useLayoutEffect has already positioned the cursor.  No React effect
  // runs after that deferred write, so the cursor stays at whatever position
  // Ink left it -- causing the IME candidate window to jump.
  //
  // By intercepting stdout.write we guarantee the cursor is repositioned
  // immediately after every write, including Ink's deferred throttled writes.
  useEffect(() => {
    if (!focus || !showCursor) {
      cursorSeqRef.current = null;
      return;
    }

    const origWrite = process.stdout.write;
    let guard = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = function (this: typeof process.stdout, ...args: any[]): boolean {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (origWrite as any).apply(this, args);
      const seq = cursorSeqRef.current;
      if (!guard && seq) {
        guard = true;
        (origWrite as any).call(this, seq);
        guard = false;
      }
      return result;
    } as typeof process.stdout.write;

    return () => {
      process.stdout.write = origWrite;
    };
  }, [focus, showCursor]);

  // Update cursor position on every render and write it immediately.
  // The cursorSeqRef is also read by the stdout interceptor above so that
  // deferred Ink writes are always followed by correct cursor positioning.
  //
  // We only SET the cursor position (CUP) without making it visible (DECTCEM).
  // The hardware cursor must stay hidden so it doesn't overlap the chalk.inverse
  // visual cursor -- a visible hardware cursor at the same cell would double-
  // invert the character, cancelling out the highlight and making the caret
  // invisible.  IME candidate windows still track the hidden cursor position.
  useLayoutEffect(() => {
    if (!focus || !showCursor) {
      cursorSeqRef.current = null;
      return;
    }
    const node = boxRef.current;
    if (!node) return;
    const { x, y } = getAbsolutePosition(node);
    const textBeforeCursor = originalValue.slice(0, cursorOffset);
    const col = x + stringWidth(textBeforeCursor) + 1; // ANSI is 1-indexed
    const row = y + 1;
    // CUP only -- no \x1b[?25h so the hardware cursor stays hidden
    const seq = `\x1b[${row};${col}H`;
    cursorSeqRef.current = seq;
    // Position cursor now (goes through interceptor, which adds one
    // redundant write -- harmless since cursor is already at correct pos)
    process.stdout.write(seq);
  });

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
