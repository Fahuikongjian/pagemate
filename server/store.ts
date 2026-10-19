import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  StudyDocument,
  StudyPage,
  Message,
  Annotation,
} from "../src/types.ts";

export function createStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
  );
  const get = (id: string): StudyDocument | undefined => {
    const row = db
      .prepare("SELECT payload FROM documents WHERE id=?")
      .get(id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : undefined;
  };
  const save = (doc: StudyDocument) => {
    db.prepare(
      "INSERT INTO documents(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    ).run(doc.id, JSON.stringify(doc));
    return doc;
  };
  const mutate = (id: string, fn: (doc: StudyDocument) => void) => {
    const doc = get(id);
    if (!doc) throw new Error("找不到这份文件");
    fn(doc);
    doc.updatedAt = new Date().toISOString();
    return save(doc);
  };
  return {
    db,
    get,
    save,
    mutate,
    list: () =>
      (
        db
          .prepare("SELECT payload FROM documents ORDER BY rowid DESC")
          .all() as { payload: string }[]
      ).map((r) => JSON.parse(r.payload) as StudyDocument),
    create: (
      name: string,
      type: string,
      sizes: { width: number; height: number }[],
    ) =>
      save({
        id: randomUUID(),
        name,
        type,
        pageCount: sizes.length,
        currentPage: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: sizes.map((s, i) => ({
          number: i + 1,
          title: `第 ${i + 1} 页`,
          text: "",
          ...s,
          messages: [],
          annotations: [],
        })),
      }),
    page: (id: string, number: number): StudyPage | undefined =>
      get(id)?.pages.find((p) => p.number === number),
    addMessage: (id: string, number: number, message: Message) =>
      mutate(id, (d) => {
        const p = d.pages.find((p) => p.number === number);
        if (!p) throw new Error("页码无效");
        p.messages.push(message);
      }),
    updateMessage: (
      id: string,
      number: number,
      messageId: string,
      text: string,
      status: Message["status"],
    ) =>
      mutate(id, (d) => {
        const m = d.pages[number - 1]?.messages.find((m) => m.id === messageId);
        if (m) {
          m.text = text;
          m.status = status;
        }
      }),
    addAnnotation: (id: string, number: number, annotation: Annotation) =>
      mutate(id, (d) => {
        const p = d.pages[number - 1];
        if (!p) throw new Error("页码无效");
        p.annotations.push(annotation);
      }),
    close: () => db.close(),
  };
}
export type Store = ReturnType<typeof createStore>;

export function exportMarkdown(doc: StudyDocument, onlyPage?: number) {
  const pages = onlyPage
    ? doc.pages.filter((p) => p.number === onlyPage)
    : doc.pages;
  return (
    `# ${doc.name}\n\n导出自页伴 · ${new Date().toISOString()}\n\n` +
    pages
      .map(
        (p) =>
          `## 第 ${p.number} 页 · ${p.title}\n\n${p.text}\n\n` +
          p.messages
            .map(
              (m) =>
                `### ${m.role === "user" ? "我的问题" : "GPT 讲解"}${m.status === "interrupted" ? "（已中断）" : ""}\n\n${m.quote ? `> ${m.quote.replace(/\n/g, "\n> ")}\n\n` : ""}${m.text}\n\n`,
            )
            .join("") +
          (p.annotations.length
            ? "### 页内批注\n\n" +
              p.annotations
                .map(
                  (a) =>
                    `- ${a.quote ? `「${a.quote}」：` : ""}${a.text || (a.kind === "ink" ? "手写笔迹" : "高亮标记")}`,
                )
                .join("\n") +
              "\n\n"
            : ""),
      )
      .join("---\n\n")
  );
}
