import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  LibraryBig,
  NotebookPen,
  RefreshCw,
  Settings2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  X,
  Highlighter,
  MousePointer2,
  Scan,
  PenLine,
  MessageSquarePlus,
  Download,
  Check,
  Search,
  Sparkles,
  Volume2,
  Square,
  Copy,
  ExternalLink,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
  Link2,
  ArrowUpRight,
  Trash2,
  Lightbulb,
  CircleHelp,
  Maximize2,
  Cloud,
  Menu,
  LoaderCircle,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, download, readSSE } from "./api";
import { openPdf, type PDFDocumentProxy } from "./pdf";
import { Viewer, Thumbnail, type Tool, type Selection } from "./Viewer";
import { annotatedPdf } from "./export-pdf";
import type { Annotation, Message, Status, StudyDocument } from "./types";
type Modal = "library" | "settings" | "sync" | "export" | null;
const prompts = [
  {
    icon: Sparkles,
    label: "讲解这一页",
    question: "请用容易理解的语言讲解这一页，帮我抓住关键知识点。",
  },
  {
    icon: Lightbulb,
    label: "举个生活中的例子",
    question: "请用一个生活中的例子解释这一页的核心概念。",
  },
  {
    icon: CircleHelp,
    label: "出一道题考考我",
    question: "根据这一页出一道理解题，先不要给出答案，等我回答后再点评。",
  },
];
export default function App() {
  const [doc, setDoc] = useState<StudyDocument | null>(null),
    [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [docs, setDocs] = useState<StudyDocument[]>([]),
    [status, setStatus] = useState<Status | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [local, setLocal] = useState(false),
    [token, setToken] = useState("");
  const [modal, setModal] = useState<Modal>(null),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState("");
  const [sidebar, setSidebar] = useState(window.innerWidth > 1050),
    [query, setQuery] = useState(""),
    [tool, setTool] = useState<Tool>("text"),
    [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<"chat" | "notes">("chat"),
    [mobilePanel, setMobilePanel] = useState<"reader" | "chat">("reader");
  const [selection, setSelection] = useState<Selection | null>(null),
    [question, setQuestion] = useState(""),
    [streaming, setStreaming] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null),
    [focusedNote, setFocusedNote] = useState<Annotation | null>(null);
  const [keyInput, setKeyInput] = useState(""),
    [modelInput, setModelInput] = useState("gpt-4.1-mini"),
    [pairing, setPairing] = useState<{ token: string; urls: string[] } | null>(
      null,
    );
  const [online, setOnline] = useState(navigator.onLine),
    [speaking, setSpeaking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    capture = useRef<((rect?: any) => string) | null>(null),
    request = useRef<AbortController | null>(null),
    sequence = useRef(0),
    pdfRef = useRef<PDFDocumentProxy | null>(null),
    chatEnd = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const page = doc?.pages[doc.currentPage - 1];
  const notice = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const narrow = matchMedia("(max-width: 1050px)");
    const portrait = matchMedia("(orientation: portrait)");
    const collapse = () => { if (narrow.matches) setSidebar(false); };
    narrow.addEventListener("change", collapse);
    portrait.addEventListener("change", collapse);
    return () => {
      narrow.removeEventListener("change", collapse);
      portrait.removeEventListener("change", collapse);
    };
  }, []);
  useEffect(() => {
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  const openDocument = useCallback(
    async (id: string) => {
      const seq = ++sequence.current;
      setLoading("正在打开文件…");
      setSelection(null);
      setFocusedNote(null);
      capture.current = null;
      try {
        const result = await api<StudyDocument>(`/api/documents/${id}`);
        if (seq !== sequence.current) return;
        const task = openPdf(id),
          parsed = await task.promise;
        if (seq !== sequence.current) {
          void task.destroy();
          return;
        }
        const previous = pdfRef.current;
        pdfRef.current = parsed;
        setPdf(parsed);
        setDoc(result);
        if (previous)
          setTimeout(() => void previous.loadingTask.destroy(), 500);
        setModal(null);
        setTool("text");
        setZoom(1);
        localStorage.setItem("pagemate-last", id);
        // Index text once after import. Rendering and questions remain available during indexing.
        if (!result.pages.some((p) => p.text)) {
          const pages = [];
          for (let n = 1; n <= parsed.numPages; n++) {
            if (seq !== sequence.current) break;
            const p = await parsed.getPage(n),
              content = await p.getTextContent();
            const text = content.items
              .map((item) =>
                "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
              )
              .join("")
              .trim();
            pages.push({
              number: n,
              text,
              title:
                text
                  .split("\n")
                  .find((l) => l.trim())
                  ?.slice(0, 60) || `第 ${n} 页`,
            });
          }
          if (pages.length === parsed.numPages) {
            const indexed = await api<StudyDocument>(`/api/documents/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ pages }),
            });
            if (seq === sequence.current)
              setDoc((prev) =>
                prev?.id === id
                  ? { ...indexed, currentPage: prev.currentPage }
                  : prev,
              );
          }
        }
      } catch (error: any) {
        notice(error.message || "文件无法打开");
      } finally {
        if (seq === sequence.current) setLoading("");
      }
    },
    [notice],
  );
  const refreshLibrary = async () => {
    const list = await api<StudyDocument[]>("/api/documents");
    setDocs(list);
    return list;
  };
  const initialize = async () => {
    try {
      const [state, list] = await Promise.all([
        api<Status>("/api/status"),
        refreshLibrary(),
      ]);
      setStatus(state);
      setModelInput(state.model);
      const last = localStorage.getItem("pagemate-last");
      await openDocument(
        list.some((d) => d.id === last) ? last! : list[0]?.id || "demo",
      );
    } catch (error: any) {
      notice(error.message);
    }
  };
  useEffect(() => {
    void api("/api/session")
      .then((session) => {
        setAuthenticated(session.authenticated);
        setLocal(session.local);
        if (session.authenticated) void initialize();
      })
      .catch(() => {
        setAuthenticated(false);
        notice("服务连接失败，请确认页伴服务已经启动。");
      });
    return () => {
      request.current?.abort();
    };
  }, []);
  // Refresh committed page data when another device or ChatGPT has changed the shared library.
  useEffect(() => {
    const timer = setInterval(async () => {
      const current = docRef.current;
      if (!current || request.current) return;
      try {
        const fresh = await api<StudyDocument>(`/api/documents/${current.id}`);
        setDoc((prev) =>
          prev?.id === fresh.id && fresh.updatedAt > prev.updatedAt
            ? { ...fresh, currentPage: prev.currentPage }
            : prev,
        );
      } catch {}
    }, 12000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (page?.messages.length && tab === "chat")
      chatEnd.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [page?.messages.length, page?.messages.at(-1)?.text, tab]);
  useEffect(() => {
    if (modal !== "settings" || !local) return;
    api("/api/pairing")
      .then(setPairing)
      .catch((e) => notice(e.message));
  }, [modal, local]);
  useEffect(() => {
    if (!modal && draftNote === null && !focusedNote) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setDraftNote(null);
        setFocusedNote(null);
      }
    };
    document.addEventListener("keydown", listener);
    const previous = document.activeElement as HTMLElement;
    const timer = setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(
            '[role="dialog"] button,[role="dialog"] textarea',
          )
          ?.focus(),
      30,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [modal, draftNote !== null, !!focusedNote]);
  const goPage = useCallback(
    (number: number) => {
      const current = docRef.current;
      if (!current || number < 1 || number > current.pageCount) return;
      if (request.current) {
        notice("请先停止当前讲解，再切换页面");
        return;
      }
      setDoc({ ...current, currentPage: number });
      setSelection(null);
      setFocusedNote(null);
      capture.current = null;
      window.getSelection()?.removeAllRanges();
      void api(`/api/documents/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ currentPage: number }),
      }).catch((e) => notice(e.message));
    },
    [notice],
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        modal ||
        draftNote !== null ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
      )
        return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goPage((docRef.current?.currentPage || 1) + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPage((docRef.current?.currentPage || 1) - 1);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [goPage, modal, draftNote]);
  const onSelect = useCallback(
    (s: Selection) => {
      setSelection(s);
      if (tool === "note") setDraftNote("");
      else {
        setTab("chat");
        setMobilePanel("chat");
      }
    },
    [tool],
  );
  const addAnnotation = useCallback(
    async (data: Omit<Annotation, "id" | "page" | "createdAt">) => {
      const current = docRef.current;
      if (!current) return;
      try {
        const annotation = await api<Annotation>(
          `/api/documents/${current.id}/pages/${current.currentPage}/annotations`,
          { method: "POST", body: JSON.stringify(data) },
        );
        setDoc((prev) =>
          prev?.id === current.id
            ? {
                ...prev,
                pages: prev.pages.map((p) =>
                  p.number === current.currentPage
                    ? { ...p, annotations: [...p.annotations, annotation] }
                    : p,
                ),
              }
            : prev,
        );
        notice(data.kind === "ink" ? "笔迹已保存" : "批注已保存到本页");
      } catch (error: any) {
        notice(error.message);
      }
    },
    [notice],
  );
  const uploadFile = async (file?: File) => {
    if (!file) return;
    if (request.current) {
      notice("请先停止讲解，再打开新文件");
      return;
    }
    setLoading(
      /\.pptx?$/i.test(file.name)
        ? "正在转换课件，保留原始排版…"
        : "正在导入 PDF…",
    );
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<StudyDocument>("/api/documents", {
        method: "POST",
        body: form,
      });
      await refreshLibrary();
      await openDocument(result.id);
      notice("文件已加入学习库");
    } catch (error: any) {
      notice(error.message);
      setLoading("");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const send = async (preset?: string) => {
    const current = docRef.current,
      p = current?.pages[current.currentPage - 1];
    const text = (preset || question).trim();
    if (!current || !p || !text || streaming || request.current) return;
    if (!status?.configured) {
      setModal("settings");
      notice("连接 GPT 后就能开始讲解，API Key 只发送到你自己的服务");
      return;
    }
    const selected = selection;
    let image = selected?.image;
    try {
      image ||= capture.current?.();
    } catch {}
    const controller = new AbortController();
    request.current = controller;
    setStreaming(true);
    setQuestion("");
    setSelection(null);
    setTab("chat");
    setMobilePanel("chat");
    const now = new Date().toISOString(),
      tempId = `answer-${Date.now()}`;
    const user: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      quote: selected?.quote,
      createdAt: now,
    };
    const answer: Message = {
      id: tempId,
      role: "assistant",
      text: "",
      status: "streaming",
      createdAt: now,
    };
    setDoc(
      (prev) =>
        prev && {
          ...prev,
          pages: prev.pages.map((pg) =>
            pg.number === p.number
              ? { ...pg, messages: [...pg.messages, user, answer] }
              : pg,
          ),
        },
    );
    try {
      const response = await fetch(
        `/api/documents/${current.id}/pages/${p.number}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: text,
            quote: selected?.quote,
            rects: selected?.rects,
            image,
          }),
          signal: controller.signal,
        },
      );
      await readSSE(response, (event, data) => {
        if (event === "delta")
          setDoc((prev) =>
            prev?.id === current.id
              ? {
                  ...prev,
                  pages: prev.pages.map((pg) =>
                    pg.number === p.number
                      ? {
                          ...pg,
                          messages: pg.messages.map((m) =>
                            m.id === tempId
                              ? { ...m, text: m.text + data.text }
                              : m,
                          ),
                        }
                      : pg,
                  ),
                }
              : prev,
          );
        if (event === "annotation")
          setDoc((prev) =>
            prev?.id === current.id
              ? {
                  ...prev,
                  pages: prev.pages.map((pg) =>
                    pg.number === p.number
                      ? { ...pg, annotations: [...pg.annotations, data] }
                      : pg,
                  ),
                }
              : prev,
          );
        if (event === "error") notice(data.error);
      });
    } catch (error: any) {
      if (error.name !== "AbortError") {
        notice(error.message);
        setQuestion(text);
      }
    } finally {
      request.current = null;
      setStreaming(false);
      try {
        const fresh = await api<StudyDocument>(`/api/documents/${current.id}`);
        setDoc((prev) =>
          prev?.id === fresh.id
            ? { ...fresh, currentPage: prev.currentPage }
            : prev,
        );
      } catch {
        setDoc((prev) =>
          prev
            ? {
                ...prev,
                pages: prev.pages.map((pg) => ({
                  ...pg,
                  messages: pg.messages.map((m) =>
                    m.status === "streaming"
                      ? { ...m, status: "interrupted" }
                      : m,
                  ),
                })),
              }
            : prev,
        );
      }
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notice("已复制，打开 ChatGPT 粘贴即可继续学习");
    } catch {
      download(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
        "页伴学习记录.txt",
      );
      notice("当前浏览器不能访问剪贴板，已下载文本");
    }
  };
  const pageTranscript = () =>
    !doc || !page
      ? ""
      : `继续帮我学习《${doc.name}》第 ${page.number} 页。\n\n课件内容：\n${page.text}\n\n` +
        page.messages
          .map(
            (m) =>
              `${m.role === "user" ? "我的问题" : "GPT 讲解"}：${m.quote ? `【${m.quote}】` : ""}${m.text}`,
          )
          .join("\n\n") +
        "\n\n批注：\n" +
        page.annotations.map((a) => a.text || a.quote || "手写标记").join("\n");
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) {
      notice("当前浏览器不支持朗读");
      return;
    }
    speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ""));
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    utterance.onend = utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
    setSpeaking(true);
  };
  const setMode = (value: Tool) => {
    setTool(value);
    if (value !== "text") setSelection(null);
  };
  const closeDialog = () => {
    setModal(null);
    setFocusedNote(null);
    setDraftNote(null);
  };
  const dialogTrap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input, textarea, select, a[href]",
      ),
    );
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  if (authenticated === false)
    return (
      <main className="pair-screen">
        <div className="brand-mark">
          <BookOpen />
        </div>
        <h1>让学习，接着发生。</h1>
        <p>连接电脑上的页伴，在平板继续阅读和提问。</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ token }),
              });
              setAuthenticated(true);
              void initialize();
            } catch (error: any) {
              notice(error.message);
            }
          }}
        >
          <label htmlFor="pair-code">电脑端连接码</label>
          <input
            id="pair-code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="current-password"
            type="password"
            required
          />
          <button className="primary">
            连接学习库 <ArrowUpRight size={17} />
          </button>
        </form>
        <small>在电脑端「设置 → 平板连接」查看连接码。</small>
        {toast && (
          <div role="alert" className="toast">
            {toast}
          </div>
        )}
      </main>
    );
  return (
    <div
      className="app-shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void uploadFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept=".pdf,.ppt,.pptx"
        aria-label="选择 PDF 或 PPT 文件"
        onChange={(e) => void uploadFile(e.target.files?.[0])}
      />
      <nav className="nav-rail" aria-label="主导航">
        <button
          className="brand-mark"
          title="页伴"
          aria-label="页伴学习库"
          onClick={() => {
            setModal("library");
            void refreshLibrary();
          }}
        >
          <BookOpen size={25} />
        </button>
        <div className="rail-links">
          <button
            aria-label="学习库"
            title="学习库"
            className={!modal || modal === "library" ? "active" : ""}
            onClick={() => {
              setModal("library");
              void refreshLibrary();
            }}
          >
            <LibraryBig size={21} />
          </button>
          <button
            aria-label="全部批注"
            title="本文件批注"
            className={tab === "notes" ? "active" : ""}
            onClick={() => {
              setTab("notes");
              setMobilePanel("chat");
            }}
          >
            <NotebookPen size={21} />
          </button>
          <button
            aria-label="与 ChatGPT 继续学习"
            title="与 ChatGPT 继续学习"
            onClick={() => setModal("sync")}
          >
            <RefreshCw size={21} />
          </button>
        </div>
        <div className="rail-bottom">
          <button
            aria-label="设置"
            title="设置"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={21} />
          </button>
          <div className="avatar" title="我的学习空间">
            我
          </div>
        </div>
      </nav>
      <div className="workspace">
        <header className="topbar">
          <button
            className="wordmark"
            aria-label="打开学习库"
            title="打开学习库"
            onClick={() => {
              setModal("library");
              void refreshLibrary();
            }}
          >
            页伴<span className="wordmark-en">PAGEMATE</span>
            <span className="top-divider" />
            <span className="space-name">我的学习空间</span>
          </button>
          <div className="top-actions">
            <span className="save-status">
              <Cloud size={15} /> {online ? "学习记录自动保存" : "网络已断开"}
            </span>
            <button
              className="button secondary open-file"
              onClick={() => fileInput.current?.click()}
              disabled={!!loading || streaming}
            >
              <Plus size={17} />
              打开文件
            </button>
          </div>
        </header>
        <div className="document-bar">
          <div className="document-title">
            <span className="file-icon">
              <FileText size={21} />
            </span>
            <div>
              <div className="eyebrow">
                正在学习 {doc?.demo && <span>· 示例课件</span>}
              </div>
              <h1>{doc?.name || "准备好，读懂下一页"}</h1>
            </div>
          </div>
          <div className="document-actions">
            <span className="file-type">
              {doc?.type.toUpperCase() || "PDF"}
              <span>·</span>
              {doc?.pageCount || "—"} 页
            </span>
            <button
              className="button ghost"
              aria-label="导出笔记"
              onClick={() => setModal("export")}
              disabled={!doc}
            >
              <Download size={17} />
              <span>导出笔记</span>
            </button>
            <button
              className="button sync-button"
              aria-label="连接 ChatGPT"
              onClick={() => setModal("sync")}
            >
              <RefreshCw size={16} />
              <span>连接 ChatGPT</span>
            </button>
          </div>
        </div>
        <div
          className={`study-layout ${!sidebar ? "sidebar-collapsed" : ""} mobile-${mobilePanel}`}
        >
          {sidebar && (
            <aside className="page-sidebar">
              <div className="sidebar-title">
                <span>页面</span>
                <span>{doc?.pageCount || 0}</span>
                <button
                  className="icon-button"
                  aria-label="收起页面列表"
                  onClick={() => setSidebar(false)}
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
              <div className="page-search">
                <Search size={14} />
                <input
                  aria-label="查找课件页面"
                  placeholder="查找页面…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="thumbnails">
                {doc?.pages
                  .filter((p) =>
                    `${p.number} ${p.title} ${p.text}`.includes(query),
                  )
                  .map((p) => (
                    <button
                      key={p.number}
                      className={`thumbnail-button ${p.number === doc.currentPage ? "selected" : ""}`}
                      onClick={() => goPage(p.number)}
                      aria-label={`转到第 ${p.number} 页：${p.title}`}
                      aria-current={
                        p.number === doc.currentPage ? "page" : undefined
                      }
                    >
                      <div className="thumbnail-page">
                        {pdf && p.number <= 120 ? (
                          <Thumbnail pdf={pdf} number={p.number} />
                        ) : (
                          <FileText />
                        )}
                        {!!p.annotations.length && (
                          <span className="thumbnail-dot" />
                        )}
                      </div>
                      <div className="thumbnail-label">
                        <span>{String(p.number).padStart(2, "0")}</span>
                        <span>{p.title}</span>
                      </div>
                    </button>
                  ))}
              </div>
              <div className="sidebar-foot">
                <span className="small-dot" />
                知识在每一页，慢慢积累
              </div>
            </aside>
          )}
          <main className="reader-panel">
            <div className="reader-toolbar">
              <div className="page-controls">
                {!sidebar && (
                  <button
                    className="icon-button"
                    aria-label="展开页面列表"
                    onClick={() => setSidebar(true)}
                  >
                    <PanelLeftOpen size={17} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="上一页"
                  disabled={!doc || doc.currentPage === 1 || streaming}
                  onClick={() => goPage(doc!.currentPage - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="page-counter">
                  <strong>{doc?.currentPage || "—"}</strong>
                  <span>/ {doc?.pageCount || "—"}</span>
                </span>
                <button
                  className="icon-button"
                  aria-label="下一页"
                  disabled={
                    !doc || doc.currentPage === doc.pageCount || streaming
                  }
                  onClick={() => goPage(doc!.currentPage + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="tools" role="toolbar" aria-label="阅读批注工具">
                {(
                  [
                    { value: "text", label: "选取文字", icon: MousePointer2 },
                    { value: "area", label: "框选提问", icon: Scan },
                    {
                      value: "highlight",
                      label: "高亮文字",
                      icon: Highlighter,
                    },
                    {
                      value: "note",
                      label: "添加批注",
                      icon: MessageSquarePlus,
                    },
                    { value: "ink", label: "手写笔", icon: PenLine },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.value}
                    className={`icon-button ${tool === t.value ? "selected-tool" : ""}`}
                    title={t.label}
                    aria-label={t.label}
                    aria-pressed={tool === t.value}
                    onClick={() => setMode(t.value)}
                  >
                    <t.icon size={18} />
                  </button>
                ))}
              </div>
              <div className="zoom-controls">
                <label className="visually-hidden" htmlFor="zoom">
                  缩放
                </label>
                <select
                  id="zoom"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                >
                  <option value={0.8}>80%</option>
                  <option value={1}>适合宽度</option>
                  <option value={1.25}>125%</option>
                  <option value={1.5}>150%</option>
                  <option value={2}>200%</option>
                </select>
                <button
                  className="icon-button"
                  aria-label="适合宽度"
                  onClick={() => setZoom(1)}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
            <div className="reader-body">
              {doc && pdf && page ? (
                <Viewer
                  key={doc.id}
                  pdf={pdf}
                  page={page}
                  zoom={zoom}
                  tool={tool}
                  onSelect={onSelect}
                  onAnnotate={addAnnotation}
                  onOpenNote={setFocusedNote}
                  onReady={(fn) => {
                    capture.current = fn;
                  }}
                />
              ) : (
                <div className="reader-empty">
                  <BookOpen size={40} />
                  <p>
                    {authenticated === null
                      ? "正在连接学习空间…"
                      : "打开一份 PDF 或 PPT，开始学习"}
                  </p>
                  <button
                    className="primary"
                    onClick={() => fileInput.current?.click()}
                  >
                    打开文件
                  </button>
                </div>
              )}
              {selection && (
                <div className="selection-actions">
                  <span>
                    <Scan size={15} />
                    {selection.image
                      ? "图表已框选"
                      : `已选 ${selection.quote.length} 字`}
                  </span>
                  <button
                    onClick={() => {
                      setMobilePanel("chat");
                      textarea.current?.focus();
                    }}
                  >
                    问问 GPT <ArrowUpRight size={14} />
                  </button>
                  <button
                    onClick={() =>
                      void addAnnotation({
                        kind: "highlight",
                        text: "",
                        quote: selection.quote,
                        rects: selection.rects,
                        color: "#ead989",
                      })
                    }
                  >
                    <Highlighter size={15} />
                    高亮
                  </button>
                  <button onClick={() => setDraftNote("")}>
                    <NotebookPen size={15} />
                    批注
                  </button>
                  <button
                    className="icon-button"
                    aria-label="取消选区"
                    onClick={() => {
                      setSelection(null);
                      window.getSelection()?.removeAllRanges();
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            <footer className="reader-footer">
              <span>
                <span className="keyboard-key">←</span>
                <span className="keyboard-key">→</span> 切换页面
              </span>
              <span>
                <PenLine size={13} /> {page?.annotations.length || 0} 条批注{" "}
                <span className="footer-divider">·</span>{" "}
                {tool === "area"
                  ? "拖动框选图表"
                  : tool === "ink"
                    ? "用手指或触控笔书写"
                    : tool === "note"
                      ? "点击页面放置批注"
                      : tool === "highlight"
                        ? "选中文字添加高亮"
                        : "长按或拖动选中文字"}
              </span>
              <div className="touch-zoom">
                <button
                  aria-label="缩小页面"
                  disabled={zoom <= 0.8}
                  onClick={() =>
                    setZoom((z) => Math.max(0.8, +(z - 0.25).toFixed(2)))
                  }
                >
                  −
                </button>
                <button aria-label="恢复适合宽度" onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  aria-label="放大页面"
                  disabled={zoom >= 3}
                  onClick={() =>
                    setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))
                  }
                >
                  ＋
                </button>
              </div>
            </footer>
          </main>
          <aside className="chat-panel">
            <div className="chat-heading">
              <div className="companion-icon">
                <Sparkles size={21} />
              </div>
              <div>
                <h2>学习搭子</h2>
                <p>
                  <span
                    className={`status-dot ${status?.configured ? "connected" : ""}`}
                  />
                  {status?.configured ? "GPT 已配置" : "等待连接 GPT"}
                  <span>·</span>专注于当前页
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="讲解设置"
                onClick={() => setModal("settings")}
              >
                <Settings2 size={17} />
              </button>
            </div>
            <div className="chat-tabs">
              <button
                className={tab === "chat" ? "active" : ""}
                onClick={() => setTab("chat")}
              >
                逐页讲解
              </button>
              <button
                className={tab === "notes" ? "active" : ""}
                onClick={() => setTab("notes")}
              >
                我的批注{" "}
                <span>
                  {doc?.pages.reduce((n, p) => n + p.annotations.length, 0) ||
                    0}
                </span>
              </button>
              <span className="context-page">
                第 {doc?.currentPage || "—"} 页
              </span>
            </div>
            {tab === "chat" ? (
              <>
                <div className="chat-scroll">
                  {!page?.messages.length ? (
                    <div className="chat-welcome">
                      <div className="welcome-illustration">
                        <div className="illustration-page">
                          <span />
                          <span />
                          <span />
                          <div>
                            <Sparkles size={22} />
                          </div>
                        </div>
                        <span className="orbit-dot one" />
                        <span className="orbit-dot two" />
                      </div>
                      <span className="eyebrow">
                        A LITTLE HELP, A DEEPER UNDERSTANDING
                      </span>
                      <h3>
                        不懂的地方，
                        <br />
                        我们一起读懂。
                      </h3>
                      <p>
                        选中一句话，框住一张图，
                        <br />
                        或者直接聊聊这一页。
                      </p>
                      <div className="prompt-list">
                        {prompts.map((p) => (
                          <button
                            key={p.label}
                            onClick={() => void send(p.question)}
                          >
                            <p.icon size={17} />
                            <span>{p.label}</span>
                            <ArrowUpRight size={15} />
                          </button>
                        ))}
                      </div>
                      <div className="page-context">
                        <FileText size={14} />
                        <span>已关联第 {page?.number || "—"} 页内容</span>
                        <Check size={13} />
                      </div>
                    </div>
                  ) : (
                    <div className="messages">
                      {page.messages.map((m) => (
                        <article key={m.id} className={`message ${m.role}`}>
                          <div className="message-name">
                            {m.role === "assistant" ? (
                              <>
                                <span className="mini-companion">
                                  <Sparkles size={13} />
                                </span>
                                页伴<span className="ai-label">GPT</span>
                              </>
                            ) : (
                              <>
                                <span className="mini-avatar">我</span>我
                              </>
                            )}
                          </div>
                          {m.quote && <blockquote>{m.quote}</blockquote>}
                          <div className="message-content">
                            {m.text ? (
                              <Markdown remarkPlugins={[remarkGfm]}>
                                {m.text}
                              </Markdown>
                            ) : (
                              <span className="thinking">
                                <i />
                                <i />
                                <i />
                              </span>
                            )}
                          </div>
                          {m.status === "interrupted" && (
                            <small>讲解已停止</small>
                          )}
                          {m.status === "error" && (
                            <small className="error-text">
                              生成失败，可重新提问
                            </small>
                          )}
                          {m.role === "assistant" &&
                            m.text &&
                            m.status !== "streaming" && (
                              <div className="answer-actions">
                                <button
                                  title="将讲解批注到本页"
                                  onClick={() => {
                                    setSelection(null);
                                    setDraftNote(m.text);
                                  }}
                                >
                                  <NotebookPen size={14} />
                                  批注到本页
                                </button>
                                <button
                                  title="朗读讲解"
                                  aria-label="朗读讲解"
                                  onClick={() => speak(m.text)}
                                >
                                  {speaking ? (
                                    <Square size={14} />
                                  ) : (
                                    <Volume2 size={14} />
                                  )}
                                </button>
                                <button
                                  title="复制讲解"
                                  aria-label="复制讲解"
                                  onClick={() => void copy(m.text)}
                                >
                                  <Copy size={14} />
                                </button>
                              </div>
                            )}
                        </article>
                      ))}
                    </div>
                  )}
                  <div ref={chatEnd} />
                </div>
                <div className="composer-area">
                  {selection && (
                    <div className="quoted-selection">
                      <div>
                        <Scan size={13} />
                        {selection.image ? "框选内容" : "选中文字"}
                        <button
                          aria-label="移除提问引用"
                          onClick={() => setSelection(null)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p>{selection.quote.slice(0, 140)}</p>
                    </div>
                  )}
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
                      ref={textarea}
                      aria-label="向 GPT 提问"
                      placeholder={
                        selection
                          ? "关于选中的内容，你想了解什么？"
                          : "这一页，有什么想问的？"
                      }
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      rows={3}
                      disabled={streaming}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-bottom">
                      <span>
                        <FileText size={13} />
                        仅本页上下文
                      </span>
                      {streaming ? (
                        <button
                          type="button"
                          className="send-button stop"
                          aria-label="停止讲解"
                          onClick={() => request.current?.abort()}
                        >
                          <Square size={16} />
                        </button>
                      ) : (
                        <button
                          className="send-button"
                          aria-label="发送问题"
                          disabled={!question.trim() || !doc}
                        >
                          <ArrowUp size={19} />
                        </button>
                      )}
                    </div>
                  </form>
                  <p className="composer-hint">
                    每页独立对话，思路自然留在这里。
                  </p>
                </div>
              </>
            ) : (
              <div className="notes-scroll">
                {doc?.pages.some((p) => p.annotations.length) ? (
                  doc.pages
                    .filter((p) => p.annotations.length)
                    .map((p) => (
                      <section key={p.number} className="page-notes">
                        <button
                          className="notes-page-title"
                          onClick={() => goPage(p.number)}
                        >
                          第 {p.number} 页 <span>{p.title}</span>
                          <ArrowUpRight size={14} />
                        </button>
                        {p.annotations.map((a) => (
                          <div key={a.id} className="note-card">
                            <div className="note-card-kind">
                              <span style={{ background: a.color }} />
                              {a.kind === "ink"
                                ? "手写笔迹"
                                : a.kind === "highlight"
                                  ? "高亮"
                                  : "学习批注"}
                              <button
                                aria-label="删除这条批注"
                                onClick={async () => {
                                  try {
                                    const updated = await api<StudyDocument>(
                                      `/api/documents/${doc.id}/pages/${p.number}/annotations/${a.id}`,
                                      { method: "DELETE" },
                                    );
                                    setDoc((prev) =>
                                      prev
                                        ? {
                                            ...updated,
                                            currentPage: prev.currentPage,
                                          }
                                        : prev,
                                    );
                                    notice("批注已删除");
                                  } catch (e: any) {
                                    notice(e.message);
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {a.quote && <blockquote>{a.quote}</blockquote>}
                            <div className="note-markdown">
                              <Markdown>
                                {a.text ||
                                  (a.kind === "ink"
                                    ? "点击页码查看页内笔迹"
                                    : "已标记这段内容")}
                              </Markdown>
                            </div>
                          </div>
                        ))}
                      </section>
                    ))
                ) : (
                  <div className="empty-notes">
                    <NotebookPen size={31} />
                    <h3>把理解，留在这一页。</h3>
                    <p>
                      高亮一句话，记下一个想法，
                      <br />
                      也可以把 GPT 的讲解存成批注。
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setSelection(null);
                        setDraftNote("");
                      }}
                    >
                      写第一条批注 <Plus size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
        <div className="mobile-switch">
          <button
            className={mobilePanel === "reader" ? "active" : ""}
            onClick={() => setMobilePanel("reader")}
          >
            <BookOpen size={17} />
            阅读课件
          </button>
          <button
            className={mobilePanel === "chat" ? "active" : ""}
            onClick={() => setMobilePanel("chat")}
          >
            <Sparkles size={17} />
            提问与批注{selection && <span className="small-dot" />}
          </button>
          <button
            aria-label="打开页面目录"
            onClick={() => {
              setSidebar(!sidebar);
              setMobilePanel("reader");
            }}
          >
            <Menu size={18} />
          </button>
        </div>
      </div>
      {loading && (
        <div className="loading-banner" role="status">
          <LoaderCircle size={18} className="rotate" />
          {loading}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {(modal || draftNote !== null || focusedNote) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <section
            className={`modal ${modal === "library" ? "library-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onKeyDown={dialogTrap}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭窗口"
              onClick={closeDialog}
            >
              <X size={20} />
            </button>
            {modal === "library" && (
              <>
                <span className="eyebrow">YOUR LEARNING SHELF</span>
                <h2 id="dialog-title">每一次打开，都更懂一点。</h2>
                <p className="modal-intro">
                  PDF、PPT 和你的理解，一起留在这里。
                </p>
                <button
                  className="upload-zone"
                  onClick={() => fileInput.current?.click()}
                  disabled={!!loading || streaming}
                >
                  <div>
                    <Plus size={24} />
                  </div>
                  <strong>打开新的学习资料</strong>
                  <span>点击选择，或拖入 PDF / PPT / PPTX · 最大 100 MB</span>
                </button>
                <h3 className="section-label">
                  继续学习 <span>{docs.length} 份资料</span>
                </h3>
                <div className="library-list">
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => void openDocument(d.id)}
                      disabled={streaming}
                    >
                      <span
                        className={`library-file ${d.type === "pdf" ? "" : "ppt"}`}
                      >
                        <FileText size={22} />
                      </span>
                      <div>
                        <strong>{d.name}</strong>
                        <p>
                          {d.pageCount} 页<span>·</span>上次读到第{" "}
                          {d.currentPage} 页 {d.demo && <span>· 示例</span>}
                        </p>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === "settings" && (
              <>
                <span className="eyebrow">MAKE IT YOURS</span>
                <h2 id="dialog-title">让页伴，准备好陪你学习。</h2>
                <p className="modal-intro">
                  文件留在你的服务里，提问时将当前页和选区发送给 OpenAI。
                </p>
                <div className="settings-status">
                  <span
                    className={`status-dot ${status?.configured ? "connected" : ""}`}
                  />
                  {status?.configured
                    ? `已配置 · ${status.model}`
                    : "还没有连接 GPT"}
                  <span className="subtle">实时流式讲解</span>
                </div>
                <form
                  className="settings-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const result = await api("/api/settings", {
                        method: "POST",
                        body: JSON.stringify({
                          apiKey: keyInput || undefined,
                          model: modelInput,
                        }),
                      });
                      setStatus((prev) => prev && { ...prev, ...result });
                      setKeyInput("");
                      notice("GPT 设置已更新");
                    } catch (error: any) {
                      notice(error.message);
                    }
                  }}
                >
                  <label htmlFor="api-key">OpenAI API Key</label>
                  <input
                    id="api-key"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      status?.configured ? "已配置，留空可保留现有 Key" : "sk-…"
                    }
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    disabled={!local}
                  />
                  <small>
                    界面中输入的 Key
                    仅在本次服务运行期间有效；长期使用请填写电脑上的 .env。
                  </small>
                  <label htmlFor="model">视觉模型</label>
                  <input
                    id="model"
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    disabled={!local}
                  />
                  <small>
                    使用你的 API 项目可访问的视觉模型。API 计费与 ChatGPT
                    订阅分开。
                  </small>
                  <button className="primary" disabled={!local} type="submit">
                    <Link2 size={16} />
                    保存连接设置
                  </button>
                  {!local && (
                    <small>
                      请在电脑本机配置 Key，平板会自动使用同一连接。
                    </small>
                  )}
                </form>
                <div className="settings-section">
                  <h3>
                    <Wifi size={17} />
                    平板连接
                  </h3>
                  <p>电脑和平板连接同一网络，在平板浏览器打开：</p>
                  {(pairing?.urls || status?.lanUrls || []).map((url) => (
                    <code className="connection-url" key={url}>
                      {url}
                    </code>
                  ))}
                  {pairing && (
                    <>
                      <label className="section-label">连接码</label>
                      <button
                        className="pair-code"
                        onClick={() => void copy(pairing.token)}
                      >
                        <code>{pairing.token}</code>
                        <Copy size={15} />
                      </button>
                    </>
                  )}
                  <small>
                    Windows 与安卓可通过浏览器使用；安装到主屏幕需要 HTTPS
                    或本机 localhost。局域网 HTTP 可以正常阅读与提问。
                  </small>
                </div>
                <div className="settings-section">
                  <h3>
                    <FileText size={17} />
                    课件转换
                  </h3>
                  <p>
                    {status?.conversion
                      ? `已检测到 ${status.conversion}，支持 PPT / PPTX 原排版转换。`
                      : "尚未检测到转换工具。安装 LibreOffice，或把课件另存为 PDF 后导入。"}
                  </p>
                </div>
              </>
            )}
            {modal === "sync" && (
              <>
                <span className="eyebrow">KEEP THE CONVERSATION GOING</span>
                <h2 id="dialog-title">在 ChatGPT，接着学。</h2>
                <p className="modal-intro">
                  把这一页的疑问、讲解和批注一起带过去。
                </p>
                <div className="sync-flow">
                  <span>
                    <BookOpen size={24} />
                    页伴学习记录
                  </span>
                  <ArrowUpRight size={22} />
                  <span>
                    <MessageSquarePlus size={24} />
                    ChatGPT 对话
                  </span>
                </div>
                <div className="sync-option">
                  <span className="step-number">01</span>
                  <div>
                    <h3>复制这一页，粘贴到 ChatGPT</h3>
                    <p>复制后打开 ChatGPT，在你的账号里继续提问。</p>
                    <div className="inline-actions">
                      <button
                        className="primary"
                        onClick={() => void copy(pageTranscript())}
                      >
                        <Copy size={15} />
                        复制本页记录
                      </button>
                      <a
                        className="button secondary"
                        href="https://chatgpt.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开 ChatGPT <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </div>
                <div className="sync-option">
                  <span className="step-number">02</span>
                  <div>
                    <h3>导出整份笔记，上传到你的对话</h3>
                    <p>Markdown 包含逐页文字、完整问答和批注文字。</p>
                    <a
                      className="text-link"
                      href={doc ? `/api/documents/${doc.id}/export` : "#"}
                      download
                    >
                      下载学习记录 .md <Download size={14} />
                    </a>
                  </div>
                </div>
                <details className="mcp-details">
                  <summary>
                    进阶：让 ChatGPT 直接读取学习库 <ChevronRight size={15} />
                  </summary>
                  <p>
                    项目已提供只读 MCP 服务。使用 Secure MCP Tunnel 连接本机的{" "}
                    <code>npm run mcp</code>，再在 ChatGPT
                    的插件设置中添加该服务。连接成功后，ChatGPT
                    能调用工具获取最新讲解和批注。
                  </p>
                  <p>
                    完整配置见项目的 <code>docs/CHATGPT.md</code>
                    。可用性取决于你的账号与工作区权限。
                  </p>
                  <a
                    className="text-link"
                    href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
                    target="_blank"
                    rel="noreferrer"
                  >
                    官方连接说明 <ExternalLink size={13} />
                  </a>
                </details>
                <div className="honest-note">
                  <CircleHelp size={17} />
                  <p>
                    这里不会自动创建 ChatGPT 聊天历史，也不会读取你的登录
                    Cookie。插件提供按需读取；复制和上传由你完成。
                  </p>
                </div>
              </>
            )}
            {modal === "export" && (
              <>
                <span className="eyebrow">
                  TAKE YOUR UNDERSTANDING WITH YOU
                </span>
                <h2 id="dialog-title">知识，带得走。</h2>
                <p className="modal-intro">选一种方式，保存这次学习的收获。</p>
                <button
                  className="export-option"
                  onClick={async () => {
                    if (!doc || !pdf) return;
                    setLoading("正在生成带批注的 PDF…");
                    try {
                      download(
                        await annotatedPdf(doc, pdf),
                        `${doc.name.replace(/\.[^.]+$/, "")}-页伴批注.pdf`,
                      );
                      notice("带批注 PDF 已导出");
                      setModal(null);
                    } catch (e: any) {
                      notice(e.message);
                    } finally {
                      setLoading("");
                    }
                  }}
                >
                  <span className="file-icon">
                    <FileText size={25} />
                  </span>
                  <div>
                    <h3>带批注的 PDF</h3>
                    <p>保留课件、高亮和笔迹，文字批注以 PDF 评论保存。</p>
                  </div>
                  <Download size={18} />
                </button>
                <a
                  className="export-option"
                  href={doc ? `/api/documents/${doc.id}/export` : "#"}
                  download
                >
                  <span className="file-icon">
                    <NotebookPen size={25} />
                  </span>
                  <div>
                    <h3>完整学习笔记 .md</h3>
                    <p>包含每页文字、提问、GPT 讲解和批注文字。</p>
                  </div>
                  <Download size={18} />
                </a>
                <p className="fine-print">
                  源文件保持原样。PPT 将导出为转换后的 PDF。
                </p>
              </>
            )}
            {draftNote !== null && (
              <>
                <span className="eyebrow">A THOUGHT WORTH KEEPING</span>
                <h2 id="dialog-title">记在第 {doc?.currentPage} 页。</h2>
                {selection?.quote && (
                  <blockquote className="note-quote">
                    {selection.quote}
                  </blockquote>
                )}
                <label className="section-label" htmlFor="note-text">
                  我的批注
                </label>
                <textarea
                  id="note-text"
                  className="note-input"
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="用自己的话，留下此刻的理解…"
                  rows={7}
                  autoFocus
                />
                <div className="dialog-actions">
                  <button
                    className="button secondary"
                    onClick={() => setDraftNote(null)}
                  >
                    取消
                  </button>
                  <button
                    className="primary"
                    disabled={!draftNote.trim()}
                    onClick={() => {
                      void addAnnotation({
                        kind: "note",
                        text: draftNote,
                        quote: selection?.quote,
                        rects: selection?.rects.length
                          ? selection.rects
                          : [{ x: 0.88, y: 0.14, width: 0.03, height: 0.03 }],
                        color: "#ead989",
                      });
                      setDraftNote(null);
                      setTool("text");
                    }}
                  >
                    <Check size={16} />
                    保存到本页
                  </button>
                </div>
              </>
            )}
            {focusedNote && (
              <>
                <span className="eyebrow">YOUR UNDERSTANDING</span>
                <h2 id="dialog-title">第 {focusedNote.page} 页 · 学习批注</h2>
                {focusedNote.quote && (
                  <blockquote className="note-quote">
                    {focusedNote.quote}
                  </blockquote>
                )}
                <div className="note-full">
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {focusedNote.text}
                  </Markdown>
                </div>
                <div className="dialog-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setFocusedNote(null);
                      setTab("notes");
                      setMobilePanel("chat");
                    }}
                  >
                    查看全部批注
                  </button>
                  <button className="primary" onClick={closeDialog}>
                    读懂了 <Check size={16} />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
