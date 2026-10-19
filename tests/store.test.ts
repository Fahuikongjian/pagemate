import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore, exportMarkdown } from "../server/store.ts";

test("逐页对话、批注和阅读位置在重启后保留，页面互相隔离", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pagemate-store-"));
  const file = path.join(dir, "test.db");
  let store = createStore(file);
  const doc = store.create("记忆课件.pdf", "pdf", [
    { width: 960, height: 600 },
    { width: 960, height: 600 },
  ]);
  store.addMessage(doc.id, 1, {
    id: "q",
    role: "user",
    text: "为什么先快后慢？",
    createdAt: "2026-10-19",
  });
  store.addMessage(doc.id, 1, {
    id: "a",
    role: "assistant",
    text: "",
    status: "streaming",
    createdAt: "2026-10-19",
  });
  store.updateMessage(
    doc.id,
    1,
    "a",
    "这是概念示意，需要结合实验材料。",
    "complete",
  );
  store.addAnnotation(doc.id, 2, {
    id: "n",
    page: 2,
    kind: "note",
    text: "用自己的话复述",
    rects: [{ x: 0.2, y: 0.3, width: 0.1, height: 0.1 }],
    color: "#ead989",
    createdAt: "2026-10-19",
  });
  store.mutate(doc.id, (d) => {
    d.currentPage = 2;
  });
  store.close();
  store = createStore(file);
  assert.equal(store.get(doc.id)?.currentPage, 2);
  assert.equal(store.page(doc.id, 1)?.messages.length, 2);
  assert.equal(store.page(doc.id, 1)?.annotations.length, 0);
  assert.equal(store.page(doc.id, 2)?.messages.length, 0);
  assert.equal(store.page(doc.id, 2)?.annotations[0].text, "用自己的话复述");
  const markdown = exportMarkdown(store.get(doc.id)!);
  assert.match(markdown, /第 1 页/);
  assert.match(markdown, /为什么先快后慢/);
  assert.match(markdown, /用自己的话复述/);
  assert.doesNotMatch(exportMarkdown(store.get(doc.id)!, 2), /为什么先快后慢/);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
