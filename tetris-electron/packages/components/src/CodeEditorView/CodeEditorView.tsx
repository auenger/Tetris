import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import monacoReactShim from "./monaco-react-shim.d.ts?raw";
import "./CodeEditorView.css";

monaco.editor.defineTheme("monokai-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "75715E" },
    { token: "string", foreground: "E6DB74" },
    { token: "keyword", foreground: "F92672" },
    { token: "number", foreground: "AE81FF" },
    { token: "constant", foreground: "AE81FF" },
    { token: "type", foreground: "66D9EF", fontStyle: "italic" },
    { token: "function", foreground: "A6E22E" },
    { token: "variable", foreground: "F8F8F2" },
    { token: "variable.predefined", foreground: "FD971F", fontStyle: "italic" },
    { token: "tag", foreground: "F92672" },
    { token: "attribute.name", foreground: "A6E22E" },
    { token: "attribute.value", foreground: "E6DB74" },
    { token: "operator", foreground: "F92672" },
  ],
  colors: {
    "editor.background": "#1F1F1F",
    "editor.foreground": "#DDDDDD",
    "editor.lineHighlightBackground": "#292929",
    "editor.selectionBackground": "#464646",
    "editorCursor.foreground": "#F2F2F2",
    "editorWhitespace.foreground": "#363636",
    "editorLineNumber.foreground": "#666666",
    "editorLineNumber.activeForeground": "#666666",
    "editorStickyScroll.shadow": "#00000000",
  },
});

monaco.editor.defineTheme("monokai-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "9F9F8F" },
    { token: "string", foreground: "F25A00" },
    { token: "keyword", foreground: "F92672" },
    { token: "number", foreground: "AE81FF" },
    { token: "constant", foreground: "AE81FF" },
    { token: "type", foreground: "28C6E4", fontStyle: "italic" },
    { token: "function", foreground: "6AAF19" },
    { token: "variable", foreground: "000000" },
    { token: "variable.predefined", foreground: "FD971F", fontStyle: "italic" },
    { token: "tag", foreground: "F92672" },
    { token: "attribute.name", foreground: "6AAF19" },
    { token: "attribute.value", foreground: "F25A00" },
    { token: "operator", foreground: "F92672" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#000000",
    "editor.lineHighlightBackground": "#A5A5A526",
    "editor.selectionBackground": "#C2E8FF",
    "editorCursor.foreground": "#000000",
    "editorWhitespace.foreground": "#E0E0E0",
    "editorLineNumber.foreground": "#9F9F8F",
    "editorLineNumber.activeForeground": "#000000",
    "editorStickyScroll.shadow": "#00000000",
  },
});

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

interface MonacoLanguageServiceDefaults {
  addExtraLib: (content: string, filePath?: string) => void;
  getExtraLibs: () => Record<string, { content: string; version: number }>;
  setCompilerOptions: (options: MonacoCompilerOptions) => void;
  setDiagnosticsOptions: (options: MonacoDiagnosticsOptions) => void;
  setEagerModelSync: (value: boolean) => void;
}

interface MonacoCompilerOptions {
  allowJs?: boolean;
  allowNonTsExtensions?: boolean;
  allowSyntheticDefaultImports?: boolean;
  esModuleInterop?: boolean;
  isolatedModules?: boolean;
  jsx?: number;
  module?: number;
  moduleResolution?: number;
  resolveJsonModule?: boolean;
  skipLibCheck?: boolean;
  strict?: boolean;
  target?: number;
}

interface MonacoDiagnosticsOptions {
  diagnosticCodesToIgnore?: number[];
  noSuggestionDiagnostics?: boolean;
}

interface MonacoTypeScriptApi {
  javascriptDefaults: MonacoLanguageServiceDefaults;
  typescriptDefaults: MonacoLanguageServiceDefaults;
  JsxEmit: {
    ReactJSX: number;
  };
  ModuleKind: {
    ESNext: number;
  };
  ScriptTarget: {
    ESNext: number;
  };
}

const monacoTypeScript = monaco.languages as unknown as {
  typescript: MonacoTypeScriptApi;
};

// Monaco's public enum still only exposes Classic/NodeJs, but its TS worker is 5.9.
// Pass the numeric Bundler enum value so the worker receives parsed compiler options.
const MONACO_BUNDLER_MODULE_RESOLUTION = 100;
const MONACO_REACT_SHIM_PATH =
  "file:///node_modules/@types/collab-monaco-react-shim/index.d.ts";

const SHARED_TS_COMPILER_OPTIONS: MonacoCompilerOptions = {
  allowJs: true,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  isolatedModules: true,
  jsx: monacoTypeScript.typescript.JsxEmit.ReactJSX,
  module: monacoTypeScript.typescript.ModuleKind.ESNext,
  moduleResolution: MONACO_BUNDLER_MODULE_RESOLUTION,
  resolveJsonModule: true,
  skipLibCheck: true,
  strict: true,
  target: monacoTypeScript.typescript.ScriptTarget.ESNext,
};

const SHARED_TS_DIAGNOSTICS: MonacoDiagnosticsOptions = {
  diagnosticCodesToIgnore: [2307, 2792],
  noSuggestionDiagnostics: true,
};

for (const defaults of [
  monacoTypeScript.typescript.javascriptDefaults,
  monacoTypeScript.typescript.typescriptDefaults,
]) {
  if (!(MONACO_REACT_SHIM_PATH in defaults.getExtraLibs())) {
    defaults.addExtraLib(monacoReactShim, MONACO_REACT_SHIM_PATH);
  }
  defaults.setCompilerOptions(SHARED_TS_COMPILER_OPTIONS);
  defaults.setDiagnosticsOptions(SHARED_TS_DIAGNOSTICS);
  defaults.setEagerModelSync(true);
}

function languageFromPath(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    jsonc: "json",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    md: "markdown",
    mdx: "markdown",
    markdown: "markdown",
    xml: "xml",
    svg: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    swift: "swift",
    kt: "kotlin",
    lua: "lua",
    r: "r",
    dockerfile: "dockerfile",
    makefile: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

function getOrCreateModel(
  filePath: string,
  content: string,
): monaco.editor.ITextModel {
  const uri = monaco.Uri.file(filePath);
  const language = languageFromPath(filePath);
  const existingModel = monaco.editor.getModel(uri);

  if (existingModel) {
    if (existingModel.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(existingModel, language);
    }
    if (existingModel.getValue() !== content) {
      existingModel.setValue(content);
    }
    return existingModel;
  }

  return monaco.editor.createModel(content, language, uri);
}

export interface CodeEditorViewHandle {
  flushPendingSave: () => Promise<boolean>;
}

interface CodeEditorViewProps {
  ref?: Ref<CodeEditorViewHandle>;
  filePath: string;
  content: string;
  onContentChange: (content: string) => Promise<WriteResult | void>;
  theme: "light" | "dark";
  editingDisabled?: boolean;
  className?: string;
}

export function CodeEditorView({
  ref,
  filePath,
  content,
  onContentChange,
  theme,
  editingDisabled = false,
  className,
}: CodeEditorViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const diskContentRef = useRef(content);
  const [showDirtyBanner, setShowDirtyBanner] = useState(false);
  const activeFilePathRef = useRef(filePath);
  const activeOnContentChangeRef = useRef(onContentChange);
  const suppressChangeRef = useRef(false);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const conflictRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Auto-save, blur and mode switches share one queue and wait for the latest edit,
  // including edits made while an earlier auto-save was still in flight.
  const flushPendingSave = useCallback(async function flush(): Promise<boolean> {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (savingRef.current) {
      if (!await savingRef.current) return false;
      return flush();
    }
    const editor = editorRef.current;
    if (!editor || !isDirtyRef.current) return true;
    if (conflictRef.current) return false;
    const model = editor.getModel();
    const value = editor.getValue();
    const save = activeOnContentChangeRef.current;
    const pending = (async () => {
      try {
        const result = await save(value);
        if (editorRef.current !== editor || modelRef.current !== model) return result?.ok !== false;
        if (result?.ok === false) {
          conflictRef.current = !!result.conflict;
          setShowDirtyBanner(!!result.conflict);
          setSaveError(result.conflict ? null : "保存失败，修改仍保留在编辑器中。");
          return false;
        }
        diskContentRef.current = value;
        isDirtyRef.current = editor.getValue() !== value;
        setSaveError(null);
        setShowDirtyBanner(false);
        return true;
      } catch {
        if (editorRef.current === editor) setSaveError("保存失败，修改仍保留在编辑器中。请重试。");
        return false;
      }
    })();
    savingRef.current = pending;
    let saved: boolean;
    try {
      saved = await pending;
    } finally {
      if (savingRef.current === pending) savingRef.current = null;
    }
    return saved && editorRef.current === editor && modelRef.current === model && isDirtyRef.current
      ? flush() : saved;
  }, []);

  useImperativeHandle(ref, () => ({ flushPendingSave }), [flushPendingSave]);

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const initialModel = getOrCreateModel(filePath, content);
    const editor = monaco.editor.create(containerRef.current, {
      model: initialModel,
      theme: theme === "dark" ? "monokai-dark" : "monokai-light",
      minimap: { enabled: false },
      wordWrap: "on",
      fontSize: 12,
      lineNumbers: "on",
      renderLineHighlight: "line",
      scrollBeyondLastLine: false,
      scrollbar: {
        verticalScrollbarSize: 7,
        horizontalScrollbarSize: 7,
      },
      automaticLayout: true,
      readOnly: editingDisabled,
      padding: { top: 8 },
      tabSize: 2,
    });

    editorRef.current = editor;
    modelRef.current = initialModel;
    diskContentRef.current = content;
    isDirtyRef.current = false;
    conflictRef.current = false;
    setSaveError(null);
    setShowDirtyBanner(false);

    const disposable = editor.onDidChangeModelContent(() => {
      if (suppressChangeRef.current) return;
      isDirtyRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { void flushPendingSave(); }, 1000);
    });

    const blurDisposable = editor.onDidBlurEditorText(() => { void flushPendingSave(); });

    return () => {
      if (isDirtyRef.current && savingRef.current && !conflictRef.current) {
        // Capture before disposing: the in-flight save may contain an older draft.
        const value = editor.getValue();
        const save = activeOnContentChangeRef.current;
        void savingRef.current.then(saved => saved ? save(value) : undefined)
          .catch(error => console.error("Failed to save closing editor:", error));
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = null;
      } else {
        void flushPendingSave();
      }
      disposable.dispose();
      blurDisposable.dispose();
      const model = modelRef.current;
      modelRef.current = null;
      editorRef.current = null;
      editor.dispose();
      model?.dispose();
    };
  }, []);

  // Swap files in-place so Monaco stays mounted while scrubbing.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (activeFilePathRef.current === filePath) {
      activeOnContentChangeRef.current = onContentChange;
      return;
    }

    if (isDirtyRef.current) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const value = editor.getValue();
      activeOnContentChangeRef.current(value);
      diskContentRef.current = value;
      isDirtyRef.current = false;
    }

    suppressChangeRef.current = true;
    const nextModel = getOrCreateModel(filePath, content);
    const previousModel = modelRef.current;
    editor.setModel(nextModel);
    suppressChangeRef.current = false;

    if (previousModel && previousModel !== nextModel) {
      previousModel.dispose();
    }

    modelRef.current = nextModel;
    editor.setScrollTop(0);
    editor.setScrollLeft(0);
    editor.setPosition({ lineNumber: 1, column: 1 });

    activeFilePathRef.current = filePath;
    activeOnContentChangeRef.current = onContentChange;
    diskContentRef.current = content;
    conflictRef.current = false;
    setSaveError(null);
    setShowDirtyBanner(false);
  }, [content, filePath, onContentChange]);

  // Update theme
  useEffect(() => {
    monaco.editor.setTheme(theme === "dark" ? "monokai-dark" : "monokai-light");
  }, [theme]);

  // Update readOnly
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: editingDisabled });
  }, [editingDisabled]);

  // Handle external content changes (file watcher)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (content === diskContentRef.current) return;

    if (!isDirtyRef.current) {
      const model = modelRef.current ?? editor.getModel();
      if (model) {
        suppressChangeRef.current = true;
        model.setValue(content);
        suppressChangeRef.current = false;
      }
      diskContentRef.current = content;
    } else {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setShowDirtyBanner(true);
      conflictRef.current = true;
    }
  }, [content]);

  const handleReload = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = modelRef.current ?? editor.getModel();
    if (model) {
      suppressChangeRef.current = true;
      model.setValue(content);
      suppressChangeRef.current = false;
    }
    diskContentRef.current = content;
    isDirtyRef.current = false;
    conflictRef.current = false;
    setSaveError(null);
    setShowDirtyBanner(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [content]);

  const handleOverwrite = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    conflictRef.current = false;
    void flushPendingSave();
  }, [flushPendingSave]);

  return (
    <div className={`code-editor-view${className ? ` ${className}` : ""}`}>
      {saveError && (
        <div className="code-editor-dirty-banner" role="alert">
          <span>{saveError}</span>
          <button type="button" onClick={() => { void flushPendingSave(); }}>重试</button>
        </div>
      )}
      {showDirtyBanner && (
        <div className="code-editor-dirty-banner">
          <span>File changed on disk</span>
          <div className="code-editor-dirty-banner-actions">
            <button type="button" onClick={handleReload}>
              Reload
            </button>
            <button type="button" onClick={handleOverwrite}>
              Keep mine
            </button>
          </div>
        </div>
      )}
      <div className="code-editor-container" ref={containerRef} />
    </div>
  );
}
