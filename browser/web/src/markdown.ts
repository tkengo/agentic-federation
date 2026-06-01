import MarkdownIt from "markdown-it";
import { createHighlighter, type Highlighter } from "shiki";

const LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "yaml",
  "bash",
  "sh",
  "python",
  "go",
  "rust",
  "html",
  "css",
  "md",
  "sql",
  "diff",
  "toml",
  "ini",
  "xml",
  "dockerfile",
  "java",
  "ruby",
  "php",
  "c",
  "cpp",
  "makefile",
];

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
  ".mjs": "js",
  ".cjs": "js",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".sql": "sql",
  ".diff": "diff",
  ".patch": "diff",
  ".toml": "toml",
  ".ini": "ini",
  ".xml": "xml",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
};

/**
 * Some files have no useful extension and are identified by their basename
 * instead (e.g. Dockerfile, Makefile).
 */
const BASENAME_TO_LANG: Record<string, string> = {
  Dockerfile: "dockerfile",
  Containerfile: "dockerfile",
  Makefile: "makefile",
  GNUmakefile: "makefile",
  Gemfile: "ruby",
  Rakefile: "ruby",
};

export function langForExt(ext: string): string | null {
  return EXT_TO_LANG[ext.toLowerCase()] ?? null;
}

export function langForFile(name: string, ext: string): string | null {
  if (BASENAME_TO_LANG[name]) return BASENAME_TO_LANG[name];
  return langForExt(ext);
}

const THEMES = { light: "github-light", dark: "github-dark" } as const;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: LANGS,
    });
  }
  return highlighterPromise;
}

function isDarkMode(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

let mdInstance: MarkdownIt | null = null;

async function getMd(): Promise<MarkdownIt> {
  if (mdInstance) return mdInstance;
  const highlighter = await getHighlighter();
  mdInstance = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    highlight(code, lang) {
      const language = LANGS.includes(lang) ? lang : "text";
      try {
        return highlighter.codeToHtml(code, {
          lang: language,
          theme: isDarkMode() ? THEMES.dark : THEMES.light,
        });
      } catch {
        return "";
      }
    },
  });
  return mdInstance;
}

export async function renderMarkdown(source: string): Promise<string> {
  const md = await getMd();
  return md.render(source);
}

/**
 * Render a code source as a Shiki-highlighted HTML block.
 * Returns null if the language is not loaded.
 */
export async function highlightCode(source: string, lang: string): Promise<string> {
  if (!LANGS.includes(lang)) return source;
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(source, {
    lang,
    theme: isDarkMode() ? THEMES.dark : THEMES.light,
  });
}
