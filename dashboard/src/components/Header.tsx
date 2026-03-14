import { Box, Text } from "ink";

const LOGO = [
  " ⠀⠀⠀⠀⡇⠀⠀⡶⠀⠀⠐⢿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡟⡀⢀⡞⠁⠀⠀⠀⠀⢸⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⡇⠀⠀⢿⠀⠀⠀⠀⡿⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⡀⠡⡾⠀⠀⠀⠀⠀⠀⡾⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⣿⠀⠀⣾⡄⠀⠀⠀⠀⠘⣆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⡀⠀⠀⠀⣘⣿⣿⣿⣷⣘⣧⠀⠀⠀⠀⣀⣾⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⣿⠀⠀⠘⡇⠀⠀⠀⠀⠀⠸⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⡶⠶⠟⠛⠛⠛⠋⠉⠉⠉⠉⠉⠉⠉⠉⠛⠛⠿⠿⠿⠀⢀⣼⣿⣿⣤⣤⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⣿⠀⠀⠀⢷⠀⠀⠀⠀⢀⣴⣿⡄⠀⠀⢀⣠⣤⡶⠾⠛⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠛⠿⣆⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⢸⡀⠀⠀⠘⣇⠀⠀⠀⢾⣿⣏⣄⣴⣾⡿⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠢⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⠈⢿⣆⣀⣠⣿⣤⠀⠀⣨⣿⣿⡿⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣷⡤⠀⠀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⠀⠀⠤⢞⣿⣧⣾⣷⠾⣿⡿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢦⡀⠀⠀⠀⠀  ",
  " ⠀⠀⠀⠀⠀⠀⣐⣿⢿⣿⡟⢁⡾⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠞⠉⠁⠈⠙⠲⡄⠀⠀⠀⠀⠀⠀⠀⢻⣦⡀⠀⠀  ",
  " ⠀⠀⠀⠀⠀⠈⠉⣰⡿⢁⡴⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⣤⣤⣤⣤⣤⣀⠀⠀⠀⠀⠀⢰⡏⠀⠀⠀⠀⠀⠀⢹⡄⠀⠀⠀⠀⠀⠀⠀⠛⢧⣀⣀  ",
  " ⠀⠀⠀⠀⠀⣐⣿⣿⣧⡿⠃⠀⠀⠀⢀⡤⠖⠚⠓⠲⡄⠀⠀⠀⠀⠀⠀⢀⣤⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠘⠻⡇⠀⣾⣿⣦⠀⠀⢀⣿⠀⠀⠀⠀⣀⣠⣤⠶⠛⠛⣧  ",
  " ⠀⠀⠀⠀⠀⣼⠻⣵⡟⠀⠀⠀⠀⣰⠋⠀⠀⠀⠀⠀⢻⠀⠀⠀⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠟⠋⠁⠀⠀⠀⠀⠙⢦⡙⠻⠛⣀⣠⠞⠁⠀⢰⣶⠿⠋⠉⠀⠀⠀⣀⣨  ",
  " ⠀⠀⠀⢠⣾⡇⢀⡟⠁⠀⠀⠀⢸⡇⠀⠀⢠⣾⣿⡆⢸⠀⠀⠀⠀⠀⠀⠙⠋⠉⠛⠛⠛⠻⠿⠛⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠁⠀⠀⠀⣀⣈⡁⠀⠀⠀⢶⡾⠛⠋⠁  ",
  " ⠀⠀⢠⣾⣿⡀⡾⠁⠀⠀⠀⠀⠸⣇⠀⠀⠘⠛⢛⡵⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠛⠁⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠉⣹⣿⣛⣻⡿⠓⠶⠶⠶⡗⠀⠀⠈⠳⠶⠶⠚⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠛⠉  ",
  " ⢺⡿⠉⢸⡟⠁⠀⠀⠀⠀⢰⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠟⠁⠀⣾⣁⣀⣠⣤⡆⠀⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⠶⠾⡟⠛⠉⠉⢁⣤⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
  " ⣀⣈⣁⣤⡶⡟⠛⢉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⠀⠀⠀⠀⠀⠀⢀⡀⡀⡀⠀⣀⣀⣀⣀⣀⣀⣀⣀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  ",
];

interface HeaderProps {
  sessionCount: number;
  cleanableCount: number;
  repoCount: number;
  workflowCount: number;
  restorableCount: number;
  compact?: boolean;
}

/** Height of the header in terminal rows (used by layout calculations). */
export const HEADER_HEIGHT_FULL = LOGO.length + 2; // logo lines + border(1) + stats(1)
export const HEADER_HEIGHT_COMPACT = 2; // border(1) + stats(1)

export function Header({ sessionCount, cleanableCount, repoCount, workflowCount, restorableCount, compact }: HeaderProps) {
  return (
    <Box flexDirection="column">
      {!compact && (
        <Box flexDirection="column" paddingX={1}>
          {LOGO.map((line, i) => (
            <Text key={i} color="cyan">{line}</Text>
          ))}
        </Box>
      )}
      <Box
        borderStyle="single"
        borderBottom={false}
        paddingX={1}
        justifyContent="flex-end"
      >
        <Text dimColor>
          {sessionCount} {sessionCount === 1 ? "session" : "sessions"} · {repoCount} {repoCount === 1 ? "repo" : "repos"} · {workflowCount} {workflowCount === 1 ? "workflow" : "workflows"}
          {restorableCount > 0 ? ` · ${restorableCount} restorable` : ""}
          {cleanableCount > 0 ? ` · ${cleanableCount} cleanable` : ""}
        </Text>
      </Box>
    </Box>
  );
}
