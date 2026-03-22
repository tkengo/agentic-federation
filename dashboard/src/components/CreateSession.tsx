import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { EmacsTextInput } from "./EmacsTextInput.js";
import { Spinner } from "./Spinner.js";
import { ScrollableRows } from "./ScrollableRows.js";
import { computeScrollOffset } from "../utils/scroll.js";
import type { SessionData } from "../utils/types.js";

type Step = "workflow" | "repo" | "branch" | "session-name";

const MAX_VISIBLE = 6;
const STANDALONE_LABEL = "Standalone";

interface WorkflowInfo {
  name: string;
  description: string;
}

interface CreatePanelProps {
  repos: string[];
  workflows: WorkflowInfo[];
  sessions: SessionData[];
  isCreating: boolean;
  onSubmit: (repo: string, branch: string, workflow: string) => void;
  onCancel: () => void;
  onStepChange: (step: Step) => void;
}

export function CreateSession({
  repos,
  workflows,
  sessions,
  isCreating,
  onSubmit,
  onCancel,
  onStepChange,
}: CreatePanelProps) {
  const [step, setStep] = useState<Step>("workflow");
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("solo");
  const [repoIndex, setRepoIndex] = useState(0);
  const [repoQuery, setRepoQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [branchError, setBranchError] = useState("");

  // Filter lists by query (workflows come from filesystem, including solo)
  const workflowOptions = workflowQuery
    ? workflows.filter((w) => {
        const q = workflowQuery.toLowerCase();
        return w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q);
      })
    : workflows;

  // Prepend "Standalone" to repo list, then apply filter
  const allRepoOptions = [STANDALONE_LABEL, ...repos];
  const filteredRepos = repoQuery
    ? allRepoOptions.filter((r) => r.toLowerCase().includes(repoQuery.toLowerCase()))
    : allRepoOptions;

  // Clamp selected index when filtered list shrinks
  const clampedWorkflowIndex = Math.min(workflowIndex, Math.max(0, workflowOptions.length - 1));
  if (clampedWorkflowIndex !== workflowIndex) setWorkflowIndex(clampedWorkflowIndex);

  const clampedRepoIndex = Math.min(repoIndex, Math.max(0, filteredRepos.length - 1));
  if (clampedRepoIndex !== repoIndex) setRepoIndex(clampedRepoIndex);

  const goToStep = (next: Step) => {
    setStep(next);
    onStepChange(next);
  };

  const validateInput = (repo: string, name: string): boolean => {
    if (!repo) {
      // Standalone: check tmux session name uniqueness
      const duplicate = sessions.some((s) => s.name === name);
      if (duplicate) {
        setBranchError(`Session already exists: ${name}`);
        return false;
      }
    } else {
      // Repo mode: check repo+branch uniqueness
      const duplicate = sessions.some(
        (s) => s.meta.repo === repo && s.meta.branch === name
      );
      if (duplicate) {
        setBranchError(`Session already exists: ${repo}/${name}`);
        return false;
      }
    }
    setBranchError("");
    return true;
  };

  useInput(
    (input, key) => {
      const isUp = key.upArrow || (key.ctrl && input === 'p');
      const isDown = key.downArrow || (key.ctrl && input === 'n');
      if (step === "workflow") {
        if (isUp) {
          setWorkflowIndex((i) => (i <= 0 ? Math.max(0, workflowOptions.length - 1) : i - 1));
        } else if (isDown) {
          setWorkflowIndex((i) => (i >= workflowOptions.length - 1 ? 0 : i + 1));
        } else if (key.return) {
          if (workflowOptions.length > 0) {
            const selected = workflowOptions[clampedWorkflowIndex]!;
            setSelectedWorkflow(selected.name);
            setWorkflowQuery("");
            goToStep("repo");
          }
        } else if (key.escape) {
          onCancel();
        }
      } else if (step === "repo") {
        if (isUp) {
          setRepoIndex((i) => (i <= 0 ? Math.max(0, filteredRepos.length - 1) : i - 1));
        } else if (isDown) {
          setRepoIndex((i) => (i >= filteredRepos.length - 1 ? 0 : i + 1));
        } else if (key.return) {
          if (filteredRepos.length > 0) {
            const selected = filteredRepos[clampedRepoIndex]!;
            if (selected === STANDALONE_LABEL) {
              setSelectedRepo("");
              setRepoQuery("");
              goToStep("session-name");
            } else {
              setSelectedRepo(selected);
              setRepoQuery("");
              goToStep("branch");
            }
          }
        } else if (key.escape) {
          setRepoQuery("");
          goToStep("workflow");
        }
      } else if (step === "branch") {
        if (key.escape) {
          setBranchError("");
          goToStep("repo");
        }
      } else if (step === "session-name") {
        if (key.escape) {
          setBranchError("");
          goToStep("repo");
        }
      }
    },
    { isActive: !isCreating }
  );

  // Build breadcrumb string
  const breadcrumbParts: string[] = [];
  if (step === "workflow") {
    // No breadcrumb yet
  } else {
    breadcrumbParts.push(selectedWorkflow);
  }
  if (step === "branch") {
    breadcrumbParts.push(selectedRepo);
  } else if (step === "session-name") {
    breadcrumbParts.push(STANDALONE_LABEL);
  }
  const breadcrumb = breadcrumbParts.length > 0
    ? breadcrumbParts.join(" > ")
    : "";

  // Render scrollable list inside panel box using shared ScrollableRows
  const renderScrollableList = (
    items: { label: string; desc?: string }[],
    selectedIdx: number,
  ) => {
    return (
      <Box flexDirection="column">
        <ScrollableRows
          items={items}
          maxVisible={MAX_VISIBLE}
          scrollOffset={computeScrollOffset(selectedIdx, items.length, MAX_VISIBLE)}
          renderRow={(item, realIndex) => {
            const isSel = realIndex === selectedIdx;
            return (
              <Text>
                {isSel ? "  " : "    "}
                {isSel ? <Text color="cyan">{"> "}</Text> : ""}
                {isSel ? <Text color="cyan">{item.label}</Text> : item.label}
                {item.desc ? <Text dimColor>  {item.desc}</Text> : ""}
              </Text>
            );
          }}
          keyExtractor={(item) => item.label}
        />
      </Box>
    );
  };

  // Step label for list steps header
  const stepLabel = step === "workflow" ? "Workflow:" : step === "repo" ? "Repo:" : "";

  // Determine if we're in an input step (branch or session-name)
  const isInputStep = step === "branch" || step === "session-name";
  const inputLabel = step === "session-name" ? "Session Name: " : "Branch: ";

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
            <Box marginLeft={2}>
              <Text bold>{`${stepLabel} `}</Text>
              {step === "workflow" && (
                <EmacsTextInput value={workflowQuery} onChange={(val) => { setWorkflowQuery(val); setWorkflowIndex(0); }} />
              )}
              {step === "repo" && (
                <EmacsTextInput value={repoQuery} onChange={(val) => { setRepoQuery(val); setRepoIndex(0); }} />
              )}
            </Box>
            {step === "workflow" && (workflowOptions.length > 0
              ? renderScrollableList(
                  workflowOptions.map((w) => ({ label: w.name, desc: w.description })),
                  clampedWorkflowIndex,
                )
              : <Box flexDirection="column">
                  <Text dimColor>{"    No matching workflows"}</Text>
                  {Array.from({ length: MAX_VISIBLE - 1 }, (_, i) => (
                    <Box key={`wf-empty-${i}`}><Text>{" "}</Text></Box>
                  ))}
                </Box>
            )}
            {step === "repo" && (filteredRepos.length > 0
              ? renderScrollableList(
                  filteredRepos.map((r) => ({
                    label: r,
                    desc: r === STANDALONE_LABEL ? "No repository" : undefined,
                  })),
                  clampedRepoIndex,
                )
              : <Box flexDirection="column">
                  <Text dimColor>{"    No matching repos"}</Text>
                  {Array.from({ length: MAX_VISIBLE - 1 }, (_, i) => (
                    <Box key={`repo-empty-${i}`}><Text>{" "}</Text></Box>
                  ))}
                </Box>
            )}
          </>
        )}

        {/* Creating spinner: shown while session is being created */}
        {isCreating && (
          <Box marginLeft={2} paddingY={0}>
            <Text color="yellow">
              <Spinner />{" "}Creating session...
            </Text>
          </Box>
        )}

        {/* Branch / Session Name step: inline label + input, compact */}
        {isInputStep && !isCreating && (
          <Box flexDirection="column">
            <Box marginLeft={2}>
              <Text bold>{inputLabel}</Text>
              {!branch && (
                <Text dimColor>Enter to auto-generate</Text>
              )}
              <EmacsTextInput
                key={step}
                value={branch}
                onChange={(text) => {
                  setBranch(text);
                  setBranchError("");
                }}
                onSubmit={(text) => {
                  if (text.trim()) {
                    const trimmed = text.trim();
                    if (validateInput(selectedRepo, trimmed)) {
                      setBranch(trimmed);
                      onSubmit(selectedRepo, trimmed, selectedWorkflow);
                    }
                  } else if (selectedRepo) {
                    // Repo mode: empty = auto-generate branch name via CLI
                    onSubmit(selectedRepo, "", selectedWorkflow);
                  } else {
                    // Auto-generate: works for both repo (branch) and standalone (session name)
                    onSubmit(selectedRepo, "", selectedWorkflow);
                  }
                }}
              />
            </Box>
          </Box>
        )}
      </Box>

      {/* Spacing between panel box and footer */}
      {(isInputStep || isCreating) && (
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
