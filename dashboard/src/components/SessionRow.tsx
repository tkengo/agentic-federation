import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./StatusBadge.js";
import { formatAge } from "../utils/format.js";
import type { SessionData } from "../utils/types.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";

interface SessionRowProps {
  session: SessionData;
  selected: boolean;
  dimmed?: boolean;
  blinkOn: boolean;
  colWidths: {
    repoBranch: number;
    session: number;
    workflow: number;
    status: number;
  };
}

const DESC_INLINE_MAX = 50;

function isStale(session: SessionData): boolean {
  if (session.stateMtimeMs == null) return false;
  return (Date.now() - session.stateMtimeMs) / 1000 >= STALE_THRESHOLD_SEC;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

export function SessionRow({ session, selected, dimmed, blinkOn, colWidths }: SessionRowProps) {
  const cursor = !dimmed && selected ? ">" : " ";
  const highlight = !dimmed && selected;
  const age = formatAge(session.meta.created_at);
  const stale = isStale(session);
  const inlineDesc = session.description ? truncate(session.description, DESC_INLINE_MAX) : null;

  return (
    <Box>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>
        {` ${cursor} `}
      </Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>
        {(session.meta.repo
          ? `${session.meta.repo}/${session.meta.branch}`
          : session.name
        ).padEnd(colWidths.repoBranch)}
      </Text>
      <Text dimColor={dimmed}>{`  `}</Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>{session.name.padEnd(colWidths.session)}</Text>
      <Text dimColor={dimmed}>{`  `}</Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>{(session.workflow ?? "solo").padEnd(colWidths.workflow)}</Text>
      <Text dimColor={dimmed}>{`  `}</Text>
      {dimmed ? (
        <Text dimColor>{`- ${session.status}`.padEnd(colWidths.status + 2)}</Text>
      ) : (
        <Box width={colWidths.status + 2}>
          <StatusBadge
            status={session.status}
            stale={stale}
            statusConfigMap={session.statusConfigMap}
            stateMtimeMs={session.stateMtimeMs}
          />
        </Box>
      )}
      {!dimmed && session.waitingHuman.waiting ? (
        <>
          <Text color="magenta" dimColor={!blinkOn}>{` [!]`}</Text>
          {session.waitingHuman.reason && (
            <Text color="yellow" dimColor={!blinkOn}>{` ${truncate(session.waitingHuman.reason, 40)}`}</Text>
          )}
        </>
      ) : (
        <Text>{`    `}</Text>
      )}
      <Text dimColor={dimmed}>{`  `}</Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed || !highlight}>{age.padStart(4)}</Text>
      {inlineDesc && (
        <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed || !highlight}>
          {`  ${inlineDesc}`}
        </Text>
      )}
    </Box>
  );
}
