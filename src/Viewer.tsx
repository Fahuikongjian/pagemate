import { useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy } from "./pdf";
import type { Annotation, Rect, StudyPage } from "./types";
import { MessageSquareText } from "lucide-react";
import "pdfjs-dist/web/pdf_viewer.css";
export type Selection = { quote: string; rects: Rect[]; image?: string };
export type Tool = "text" | "area" | "highlight" | "note" | "ink";
type Props = {
  pdf: PDFDocumentProxy;
  page: StudyPage;
  zoom: number;
  tool: Tool;
  onSelect: (s: Selection) => void;
  onAnnotate: (a: Omit<Annotation, "id" | "page" | "createdAt">) => void;
  onOpenNote: (a: Annotation) => void;
  onReady: (capture: (rect?: Rect) => string) => void;
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function Viewer({
  pdf,
  page,
  zoom,
  tool,
  onSelect,
  onAnnotate,
  onOpenNote,
  onReady,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null),
    sheet = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [drag, setDrag] = useState<Rect | null>(null),
    [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null),
    drawing = useRef<{ x: number; y: number }[]>([]);
  const scale = (width * zoom) / page.width;
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(240, entries[0].contentRect.width - 64)),
    );
    if (wrap.current) observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false,
      render: any,
      layer: TextLayer | undefined;
    setBusy(true);
    setError("");
    (async () => {
      const p = await pdf.getPage(page.number);
      if (cancelled) return;
      const viewport = p.getViewport({ scale }),
        ratio = Math.min(window.devicePixelRatio || 1, 2);
      const c = canvas.current!;
      c.width = Math.floor(viewport.width * ratio);
      c.height = Math.floor(viewport.height * ratio);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      text.current!.replaceChildren();
      render = p.render({
        canvas: c,
        canvasContext: c.getContext("2d")!,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await render.promise;
      if (cancelled) return;
      const content = await p.getTextContent();
      if (cancelled) return;
      layer = new TextLayer({
        textContentSource: content,
        container: text.current!,
        viewport,
      });
      await layer.render();
      if (cancelled) return;
      setBusy(false);
      onReady((rect) => {
        const source = canvas.current!,
          dest = document.createElement("canvas");
        const r = rect || { x: 0, y: 0, width: 1, height: 1 };
        const w = source.width * r.width,
          h = source.height * r.height;
        const down = Math.min(1, 1600 / Math.max(w, h));
        dest.width = Math.max(1, w * down);
        dest.height = Math.max(1, h * down);
        dest
          .getContext("2d")!
          .drawImage(
            source,
            r.x * source.width,
            r.y * source.height,
            w,
            h,
            0,
            0,
            dest.width,
            dest.height,
          );
        return dest.toDataURL("image/jpeg", 0.82);
      });
    })().catch((e) => {
      if (
        !cancelled &&
        e.name !== "RenderingCancelledException" &&
        e.name !== "AbortException"
      ) {
        setError("这一页没有成功显示，请重新打开文件。");
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
      render?.cancel();
      layer?.cancel();
    };
  }, [pdf, page.number, scale]);
  useEffect(() => {
    setDrag(null);
    setPoints([]);
    start.current = null;
  }, [page.number, tool]);
  useEffect(() => {
    const select = () => {
      if (tool !== "text" && tool !== "highlight") return;
      const selected = window.getSelection();
      if (!selected?.rangeCount || !selected.toString().trim()) return;
      const range = selected.getRangeAt(0);
      if (!text.current?.contains(range.commonAncestorContainer)) return;
      const box = sheet.current!.getBoundingClientRect();
      const rects = Array.from(range.getClientRects())
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => ({
          x: clamp((r.x - box.x) / box.width),
          y: clamp((r.y - box.y) / box.height),
          width: clamp(r.width / box.width),
          height: clamp(r.height / box.height),
        }));
      const quote = selected.toString().trim().slice(0, 12000);
      if (tool === "highlight") {
        onAnnotate({
          kind: "highlight",
          text: "",
          quote,
          rects,
          color: "#ead989",
        });
        selected.removeAllRanges();
      } else onSelect({ quote, rects });
    };
    const delayed = () => {
      clearTimeout(timer);
      timer = setTimeout(select, 220);
    };
    let timer: ReturnType<typeof setTimeout>;
    document.addEventListener("selectionchange", delayed);
    document.addEventListener("pointerup", delayed);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", delayed);
      document.removeEventListener("pointerup", delayed);
    };
  }, [tool, page.number, onSelect, onAnnotate]);
  const pos = (e: React.PointerEvent) => {
    const r = sheet.current!.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.x) / r.width),
      y: clamp((e.clientY - r.y) / r.height),
    };
  };
  const end = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = pos(e),
      initial = start.current;
    start.current = null;
    if (tool === "ink") {
      const pts = [...drawing.current, p];
      if (pts.length > 1)
        onAnnotate({
          kind: "ink",
          text: "",
          rects: [],
          points: pts,
          color: "#416b58",
        });
      setPoints([]);
      return;
    }
    const rect = {
      x: Math.min(initial.x, p.x),
      y: Math.min(initial.y, p.y),
      width: Math.abs(p.x - initial.x),
      height: Math.abs(p.y - initial.y),
    };
    setDrag(null);
    if (rect.width < 0.01 || rect.height < 0.01) return;
    if (tool === "highlight") {
      onAnnotate({
        kind: "highlight",
        text: "",
        rects: [rect],
        color: "#ead989",
      });
      return;
    }
    const layerBox = sheet.current!.getBoundingClientRect();
    const quote = Array.from(text.current!.querySelectorAll("span"))
      .filter((span) => {
        const r = span.getBoundingClientRect(),
          x = (r.x + r.width / 2 - layerBox.x) / layerBox.width,
          y = (r.y + r.height / 2 - layerBox.y) / layerBox.height;
        return (
          x >= rect.x &&
          x <= rect.x + rect.width &&
          y >= rect.y &&
          y <= rect.y + rect.height
        );
      })
      .map((el) => el.textContent)
      .join(" ")
      .slice(0, 12000);
    const c = canvas.current!,
      crop = document.createElement("canvas");
    crop.width = Math.max(1, c.width * rect.width);
    crop.height = Math.max(1, c.height * rect.height);
    crop
      .getContext("2d")!
      .drawImage(
        c,
        c.width * rect.x,
        c.height * rect.y,
        c.width * rect.width,
        c.height * rect.height,
        0,
        0,
        crop.width,
        crop.height,
      );
    onSelect({
      quote: quote || "已框选当前页的图表区域",
      rects: [rect],
      image: crop.toDataURL("image/jpeg", 0.85),
    });
  };
  return (
    <div className="viewer-scroll" ref={wrap}>
      <div
        className={`pdf-sheet tool-${tool}`}
        ref={sheet}
        style={
          {
            width: width * zoom,
            height: page.height * scale,
            "--total-scale-factor": scale,
            "--scale-factor": scale,
          } as React.CSSProperties
        }
        data-testid="pdf-sheet"
      >
        <canvas ref={canvas} aria-label={`第 ${page.number} 页课件`} />
        <div className="textLayer" ref={text} />
        <div className="annotations" aria-label="页内批注">
          {page.annotations.map((a) =>
            a.kind === "ink" ? (
              <svg
                key={a.id}
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                className="ink-layer"
              >
                <polyline
                  points={a.points
                    ?.map((p) => `${p.x * 1000},${p.y * 1000}`)
                    .join(" ")}
                  fill="none"
                  stroke={a.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : (
              <div key={a.id}>
                {a.rects.map((r, j) => (
                  <div
                    key={j}
                    className={`annotation-rect ${a.kind}`}
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.width * 100}%`,
                      height: `${r.height * 100}%`,
                      backgroundColor: a.color,
                    }}
                  />
                ))}
                {a.kind === "note" && (
                  <button
                    className="note-pin"
                    aria-label={`查看批注：${a.text.slice(0, 30)}`}
                    style={{
                      left: `${Math.min(0.95, a.rects[0]?.x ?? 0.88) * 100}%`,
                      top: `${(a.rects[0]?.y ?? 0.14) * 100}%`,
                    }}
                    onClick={() => onOpenNote(a)}
                  >
                    <MessageSquareText size={17} />
                  </button>
                )}
              </div>
            ),
          )}
        </div>
        {["area", "note", "ink"].includes(tool) && (
          <div
            className="gesture-layer"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              if (busy) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = pos(e);
              if (tool === "note") {
                onSelect({
                  quote: "在此处添加批注",
                  rects: [{ ...p, width: 0.03, height: 0.03 }],
                });
                return;
              }
              start.current = p;
              drawing.current = [p];
            }}
            onPointerMove={(e) => {
              if (!start.current) return;
              const p = pos(e);
              if (tool === "ink") {
                drawing.current.push(p);
                setPoints([...drawing.current]);
              } else
                setDrag({
                  x: Math.min(start.current.x, p.x),
                  y: Math.min(start.current.y, p.y),
                  width: Math.abs(start.current.x - p.x),
                  height: Math.abs(start.current.y - p.y),
                });
            }}
            onPointerUp={end}
            onPointerCancel={() => {
              start.current = null;
              setDrag(null);
              setPoints([]);
            }}
          />
        )}
        {drag && (
          <div
            className="selection-rect"
            style={{
              left: `${drag.x * 100}%`,
              top: `${drag.y * 100}%`,
              width: `${drag.width * 100}%`,
              height: `${drag.height * 100}%`,
            }}
          />
        )}
        {!!points.length && (
          <svg
            className="ink-layer"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
          >
            <polyline
              points={points
                .map((p) => `${p.x * 1000},${p.y * 1000}`)
                .join(" ")}
              fill="none"
              stroke="#416b58"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {busy && (
          <div className="page-loading">
            <span className="spinner" />
            正在铺开这一页…
          </div>
        )}
        {error && <div className="page-loading">{error}</div>}
      </div>
      <div className="page-caption">
        <span>第 {String(page.number).padStart(2, "0")} 页</span>
        <span>选中文字，或者框选图表，随时提问</span>
      </div>
    </div>
  );
}
export function Thumbnail({
  pdf,
  number,
}: {
  pdf: PDFDocumentProxy;
  number: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancel = false,
      task: any;
    (async () => {
      const p = await pdf.getPage(number);
      if (cancel) return;
      const viewport = p.getViewport({
        scale: 170 / p.getViewport({ scale: 1 }).width,
      });
      const c = ref.current!;
      c.width = viewport.width * 1.5;
      c.height = viewport.height * 1.5;
      task = p.render({
        canvas: c,
        canvasContext: c.getContext("2d")!,
        viewport,
        transform: [1.5, 0, 0, 1.5, 0, 0],
      });
      await task.promise;
    })().catch(() => {});
    return () => {
      cancel = true;
      task?.cancel();
    };
  }, [pdf, number]);
  return <canvas ref={ref} aria-hidden="true" />;
}
