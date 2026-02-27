import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { SessionData } from "../utils/types.js";

type Step = "workflow" | "repo" | "branch";

const MAX_VISIBLE = 3;

interface WorkflowInfo {
  name: string;
  description: string;
}

interface CreatePanelProps {
  repos: string[];
  workflows: WorkflowInfo[];
  sessions: SessionData[];
  onSubmit: (repo: string, branch: string, workflow?: string) => void;
  onCancel: () => void;
  onStepChange: (step: Step) => void;
}

// Compute visible window start for scrollable list
function computeScrollOffset(selectedIndex: number, totalItems: number): number {
  if (totalItems <= MAX_VISIBLE) return 0;
  if (selectedIndex === 0) return 0;
  if (selectedIndex >= totalItems - 1) return totalItems - MAX_VISIBLE;
  return Math.max(0, Math.min(selectedIndex - 1, totalItems - MAX_VISIBLE));
}

export function CreateSession({
  repos,
  workflows,
  sessions,
  onSubmit,
  onCancel,
  onStepChange,
}: CreatePanelProps) {
  const [step, setStep] = useState<Step>("workflow");
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [repoIndex, setRepoIndex] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [branchError, setBranchError] = useState("");

  // Build workflow options: "solo" first, then workflow files
  const workflowOptions: WorkflowInfo[] = [
    { name: "solo", description: "Terminal + editor only, no agent team" },
    ...workflows,
  ];

  const goToStep = (next: Step) => {
    setStep(next);
    onStepChange(next);
  };

  const validateBranch = (repo: string, branchName: string): boolean => {
    const duplicate = sessions.some(
      (s) => s.meta.repo === repo && s.meta.branch === branchName
    );
    if (duplicate) {
      setBranchError(`Session already exists: ${repo}/${branchName}`);
      return false;
    }
    setBranchError("");
    return true;
  };

  useInput(
    (input, key) => {
      if (step === "workflow") {
        if (key.upArrow || input === "k") {
          setWorkflowIndex((i) => Math.max(0, i - 1));
        } else if (key.downArrow || input === "j") {
          setWorkflowIndex((i) => Math.min(workflowOptions.length - 1, i + 1));
        } else if (key.return) {
          const selected = workflowOptions[workflowIndex]!;
          setSelectedWorkflow(selected.name === "solo" ? null : selected.name);
          goToStep("repo");
        } else if (key.escape) {
          onCancel();
        }
      } else if (step === "repo") {
        if (key.upArrow || input === "k") {
          setRepoIndex((i) => Math.max(0, i - 1));
        } else if (key.downArrow || input === "j") {
          setRepoIndex((i) => Math.min(repos.length - 1, i + 1));
        } else if (key.return) {
          setSelectedRepo(repos[repoIndex]!);
          goToStep("branch");
        } else if (key.escape) {
          goToStep("workflow");
        }
      } else if (step === "branch") {
        if (key.escape) {
          setBranchError("");
          goToStep("repo");
        }
      }
    },
    { isActive: true }
  );

  if (repos.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">No repos configured. Run: fed repo add &lt;name&gt;</Text>
      </Box>
    );
  }

  // Build breadcrumb string
  const breadcrumbParts: string[] = [];
  if (step === "workflow") {
    // No breadcrumb yet
  } else {
    breadcrumbParts.push(selectedWorkflow ?? "solo");
  }
  if (step === "branch") {
    breadcrumbParts.push(selectedRepo);
  }
  const breadcrumb = breadcrumbParts.length > 0
    ? breadcrumbParts.join(" > ")
    : "";

  // Render scrollable list inside panel box
  // Indicators (▲/▼) appear at the right edge of first/last visible rows
  const renderScrollableList = (
    items: { label: string; desc?: string }[],
    selectedIdx: number,
  ) => {
    const total = items.length;
    const offset = computeScrollOffset(selectedIdx, total);
    const visible = items.slice(offset, offset + MAX_VISIBLE);
    const hasMore = total > MAX_VISIBLE;
    const showUp = hasMore && offset > 0;
    const showDown = hasMore && offset + MAX_VISIBLE < total;

    // Pad to always show MAX_VISIBLE rows
    const emptyRows = MAX_VISIBLE - visible.length;

    return (
      <Box flexDirection="column">
        {visible.map((item, i) => {
          const realIndex = offset + i;
          const isSel = realIndex === selectedIdx;
          // Show ▲ on first row, ▼ on last row (right-aligned)
          const isFirst = i === 0;
          const isLast = i === visible.length - 1 || (i === visible.length - 1 + emptyRows);
          const indicator = (isFirst && showUp) ? " \u25B2" : (isLast && showDown) ? " \u25BC" : "";
          return (
            <Box key={item.label}>
              <Box flexGrow={1}>
                <Text>
                  {isSel ? "  " : "    "}
                  {isSel ? <Text color="cyan">{"> "}</Text> : ""}
                  {isSel ? <Text color="cyan">{item.label}</Text> : item.label}
                  {item.desc ? <Text dimColor>  {item.desc}</Text> : ""}
                </Text>
              </Box>
              {indicator && <Text dimColor>{indicator} </Text>}
            </Box>
          );
        })}
        {/* Pad empty rows to keep height stable */}
        {Array.from({ length: emptyRows }, (_, i) => {
          const isLastPad = i === emptyRows - 1;
          const indicator = (isLastPad && showDown) ? " \u25BC" : "";
          return (
            <Box key={`empty-${i}`}>
              <Box flexGrow={1}><Text>{" "}</Text></Box>
              {indicator && <Text dimColor>{indicator} </Text>}
            </Box>
          );
        })}
      </Box>
    );
  };

  // Step label for list steps header
  const stepLabel = step === "workflow" ? "Workflow:" : step === "repo" ? "Repo:" : "";

  return (
    <Box flexDirection="column">
      {/* Breadcrumb line - always rendered to keep stable layout */}
      <Box paddingX={1}>
        <Text dimColor>{breadcrumb || " "}</Text>
      </Box>

      {/* Panel box */}
      <Box
        flexDirection="column"
        borderStyle="single"
        marginX={1}
        paddingY={0}
      >
        {/* List steps: header + scrollable list */}
        {(step === "workflow" || step === "repo") && (
          <>
            <Text bold>{`  ${stepLabel}`}</Text>
            {step === "workflow" && renderScrollableList(
              workflowOptions.map((w) => ({ label: w.name, desc: w.description })),
              workflowIndex,
            )}
            {step === "repo" && renderScrollableList(
              repos.map((r) => ({ label: r })),
              repoIndex,
            )}
          </>
        )}

        {/* Branch step: inline label + input, compact */}
        {step === "branch" && (
          <Box flexDirection="column">
            <Box marginLeft={2}>
              <Text bold>{"Branch: "}</Text>
              <TextInput
                value={branch}
                onChange={(text) => {
                  setBranch(text);
                  setBranchError("");
                }}
                onSubmit={(text) => {
                  if (text.trim()) {
                    const trimmed = text.trim();
                    if (validateBranch(selectedRepo, trimmed)) {
                      setBranch(trimmed);
                      onSubmit(selectedRepo, trimmed, selectedWorkflow ?? undefined);
                    }
                  } else {
                    goToStep("repo");
                  }
                }}
              />
            </Box>
          </Box>
        )}
      </Box>

      {/* Spacing between panel box and footer */}
      {step === "branch" && (
        <>
          {branchError && (
            <Box marginLeft={2}>
              <Text color="red">{branchError}</Text>
            </Box>
          )}
          {!branchError && (<Text>{" "}</Text>)}
          <Text>{" "}</Text>
          <Text>{" "}</Text>
        </>
      )}
    </Box>
  );
}
