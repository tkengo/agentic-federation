import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { RiMarkdownFill, RiFileTextLine, RiSearchLine } from "@remixicon/react";
import type { TreeNode } from "../api.ts";

export type FileKind = "session" | "repo";

export interface FlatFile {
  kind: FileKind;
  path: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionTree: TreeNode[];
  repoTree: TreeNode[];
  onSelect: (kind: FileKind, path: string) => void;
}

const MAX_RESULTS = 50;

export function FileSearch({ open, onOpenChange, sessionTree, repoTree, onSelect }: Props): React.ReactElement {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allFiles = useMemo<FlatFile[]>(() => {
    return [
      ...flattenFiles(sessionTree, "session"),
      ...flattenFiles(repoTree, "repo"),
    ];
  }, [sessionTree, repoTree]);

  const results = useMemo<FlatFile[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allFiles.slice(0, MAX_RESULTS);
    return allFiles
      .filter((f) => f.path.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [allFiles, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `li[data-index='${activeIndex}']`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[activeIndex];
      if (picked) {
        onSelect(picked.kind, picked.path);
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bu-dialog-backdrop" />
        <Dialog.Popup className="bu-dialog-popup file-search">
          <Dialog.Title className="visually-hidden">Search files</Dialog.Title>
          <div className="file-search__input-wrap">
            <RiSearchLine size={16} className="file-search__icon" />
            <input
              ref={inputRef}
              type="text"
              className="file-search__input"
              placeholder="Search files…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <span className="file-search__count">{results.length}</span>
          </div>
          <ul ref={listRef} className="file-search__list">
            {results.length === 0 && <li className="file-search__empty">No matches</li>}
            {results.map((f, i) => {
              const Icon = f.name.endsWith(".md") ? RiMarkdownFill : RiFileTextLine;
              const isActive = i === activeIndex;
              return (
                <li
                  key={`${f.kind}:${f.path}`}
                  data-index={i}
                  className={`file-search__item${isActive ? " file-search__item--active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(f.kind, f.path);
                    onOpenChange(false);
                  }}
                >
                  <Icon
                    size={14}
                    className={`file-search__file-icon ${f.name.endsWith(".md") ? "tree-icon--md" : "tree-icon--file"}`}
                  />
                  <span className="file-search__name">{f.name}</span>
                  <span className="file-search__path">{f.path}</span>
                  <span className={`file-search__kind file-search__kind--${f.kind}`}>{f.kind}</span>
                </li>
              );
            })}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function flattenFiles(nodes: TreeNode[], kind: FileKind): FlatFile[] {
  const out: FlatFile[] = [];
  const walk = (ns: TreeNode[]): void => {
    for (const n of ns) {
      if (n.type === "file") {
        out.push({ kind, path: n.path, name: n.name });
      } else if (n.children) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}
