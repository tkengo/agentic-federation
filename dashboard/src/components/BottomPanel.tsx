import React from "react";
import { Box } from "ink";

// Fixed height for the bottom panel area.
// Sized to fit the tallest panel (CreateSession list mode / AddRepo CloneForm = 10 rows).
export const BOTTOM_PANEL_HEIGHT = 10;

interface BottomPanelProps {
  children?: React.ReactNode;
}

export function BottomPanel({ children }: BottomPanelProps) {
  return (
    <Box
      flexDirection="column"
      height={BOTTOM_PANEL_HEIGHT}
      overflow="hidden"
    >
      {children}
    </Box>
  );
}
