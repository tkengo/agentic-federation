import React from "react";
import { Box, Text } from "ink";
import { StatusBadge } from "./StatusBadge.js";
import { formatCreated } from "../utils/format.js";
import type { SessionData } from "../utils/types.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";

interface SessionRowProps {
  session: SessionData;
  selected: boolean;
  dimmed?: boolean;
  blinkOn: boolean;
  colWidths: {
    repo: number;
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
  const created = formatCreated(session.meta.created_at);
  const stale = isStale(session);

  // Override status when tmux session is dead
  const displayStatus = session.tmuxAlive ? session.status : "disconnected";

  // Determine inline text after CREATED: waiting reason takes priority over description
  const isWaiting = session.waitingHuman.waiting && !!session.waitingHuman.reason;
  const inlineText = isWaiting
    ? truncate(session.waitingHuman.reason!, DESC_INLINE_MAX)
    : session.description
      ? truncate(session.description, DESC_INLINE_MAX)
      : null;

  return (
    <Box>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>
        {` ${cursor} `}
      </Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>
        {(session.meta.repo
          ? session.meta.repo
          : session.name
        ).padEnd(colWidths.repo)}
      </Text>
      <Text dimColor={dimmed}>{`  `}</Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>{session.name.padEnd(colWidths.session)}</Text>
      <Text dimColor={dimmed}>{`  `}</Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>{(session.workflow ?? "solo").padEnd(colWidths.workflow)}</Text>
      <Text dimColor={dimmed}>{`  `}</Text>
      <Box width={colWidths.status}>
        <StatusBadge
          status={displayStatus}
          currentStep={session.tmuxAlive ? session.currentStep : null}
          stale={stale}
          stateMtimeMs={session.stateMtimeMs}
          highlight={highlight}
          dimColor={dimmed}
        />
        {session.waitingHuman.waiting && (
          <Text
            color={highlight ? "cyan" : "yellow"}
            bold={highlight}
            dimColor={dimmed || (!highlight && !blinkOn)}
          >
            {` [!]`}
          </Text>
        )}
      </Box>
      <Text dimColor={dimmed}>{`  `}</Text>
      <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed || !highlight}>{created}</Text>
      {inlineText && (
        <Text
          color={highlight ? "cyan" : (isWaiting ? "yellow" : undefined)}
          bold={highlight}
          dimColor={!highlight && !isWaiting}
        >
          {`  ${inlineText}`}
        </Text>
      )}
    </Box>
  );
}
