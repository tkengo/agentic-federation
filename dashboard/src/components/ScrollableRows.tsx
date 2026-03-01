import React from "react";
import { Box, Text } from "ink";

// Width reserved for the scroll indicator column: space + arrow + right margin
export const INDICATOR_COL_WIDTH = 3;

interface ScrollableRowsProps<T> {
  items: T[];
  maxVisible: number;
  scrollOffset: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  padEmpty?: boolean;
}

export function ScrollableRows<T>({
  items,
  maxVisible,
  scrollOffset,
  renderRow,
  keyExtractor,
  padEmpty = true,
}: ScrollableRowsProps<T>) {
  const visible = items.slice(scrollOffset, scrollOffset + maxVisible);
  const hasMoreUp = scrollOffset > 0;
  const hasMoreDown = scrollOffset + maxVisible < items.length;
  const needsIndicator = hasMoreUp || hasMoreDown;

  const renderIndicator = (showUp: boolean, showDown: boolean) => {
    if (!needsIndicator) return null;
    const char = showUp ? " \u25B2 " : showDown ? " \u25BC " : "   ";
    return <Text dimColor>{char}</Text>;
  };

  return (
    <>
      {visible.map((item, i) => {
        const realIndex = scrollOffset + i;
        const isFirst = i === 0;
        const isLast = i === visible.length - 1;
        const key = keyExtractor ? keyExtractor(item, realIndex) : `sr-${scrollOffset}-${i}`;
        return (
          <Box key={key}>
            <Box flexGrow={1}>
              {renderRow(item, realIndex)}
            </Box>
            {renderIndicator(isFirst && hasMoreUp, isLast && hasMoreDown)}
          </Box>
        );
      })}
      {padEmpty && Array.from(
        { length: Math.max(0, maxVisible - visible.length) },
        (_, i) => {
          const isLastPad = i === maxVisible - visible.length - 1;
          return (
            <Box key={`sr-pad-${i}`}>
              <Box flexGrow={1}><Text>{" "}</Text></Box>
              {renderIndicator(false, isLastPad && hasMoreDown)}
            </Box>
          );
        },
      )}
    </>
  );
}
