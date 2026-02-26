import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./StatusBadge.js";
import { formatAge } from "../utils/format.js";
import type { SessionData } from "../utils/types.js";

interface SessionRowProps {
  session: SessionData;
  selected: boolean;
  colWidths: {
    repo: number;
    branch: number;
    mode: number;
    status: number;
  };
}

export function SessionRow({ session, selected, colWidths }: SessionRowProps) {
  const cursor = selected ? ">" : " ";
  const age = formatAge(session.meta.created_at);

  return (
    <Box>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        {` ${cursor} `}
      </Text>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        {session.meta.repo.padEnd(colWidths.repo)}
      </Text>
      <Text>{`  `}</Text>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        {session.meta.branch.padEnd(colWidths.branch)}
      </Text>
      <Text>{`  `}</Text>
      <Text dimColor>{session.meta.mode.padEnd(colWidths.mode)}</Text>
      <Text>{`  `}</Text>
      <Box width={colWidths.status + 2}>
        <StatusBadge status={session.status} />
      </Box>
      <Text>{`  `}</Text>
      <Text dimColor>{age.padStart(4)}</Text>
      {session.workflow && (
        <>
          <Text>{`  `}</Text>
          <Text dimColor>[{session.workflow}]</Text>
        </>
      )}
    </Box>
  );
}
