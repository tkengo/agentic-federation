import React from "react";
import { Box, Text } from "ink";

export type TabId = "sessions" | "repos" | "workflows" | "restorable" | "protected";

interface TabDef {
  id: TabId;
  label: string;
  count: number;
}

interface TabBarProps {
  activeTab: TabId;
  tabs: TabDef[];
}

export function TabBar({ activeTab, tabs }: TabBarProps) {
  return (
    <Box paddingX={1}>
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <React.Fragment key={tab.id}>
            {i > 0 && <Text dimColor>{"  "}</Text>}
            <Text
              color={isActive ? "cyan" : undefined}
              bold={isActive}
              dimColor={!isActive}
            >
              {isActive ? "\u25B8 " : "  "}
              {tab.label} ({tab.count})
            </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
