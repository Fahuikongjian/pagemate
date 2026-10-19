import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, degrees } from "pdf-lib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createStore } from "../server/store.ts";

const root = path.resolve("."),
  dir = mkdtempSync(path.join(tmpdir(), "pagemate-api-"));
const token = "automated-test-connection-code";
let processHandle: ChildProcess,
  cookie = "",
  base = "",
  requestBody: any;
let modelMode = "normal";
const model = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  requestBody = JSON.parse(Buffer.concat(chunks).toString());
  if (modelMode === "unauthorized") {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "invalid test key" } }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const emit = (value: object) =>
    res.write(`data: ${JSON.stringify(value)}\n\n`);
  emit({
    type: "response.created",
    response: { id: "test", status: "in_progress" },
  });
  if (modelMode === "annotation")
    emit({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        name: "add_page_annotation",
        arguments: JSON.stringify({
          text: "主动回忆，比反复浏览更能检验理解。",
        }),
      },
    });
  else {
    emit({ type: "response.output_text.delta", delta: "先理解，" });
    await new Promise((r) => setTimeout(r, modelMode === "slow" ? 800 : 20));
    emit({ type: "response.output_text.delta", delta: "再回忆。" });
  }
  emit({
    type: "response.completed",
    response: { id: "test", status: "completed" },
  });
  res.end();
});
before(async () => {
  await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
  const modelPort = (model.address() as any).port;
  // Reserve an available test port, then start a separate application with disposable data.
  const reserve = createServer();
  await new Promise<void>((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const port = (reserve.address() as any).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  processHandle = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts", "--production"],
    {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        DATA_DIR: dir,
        OPENAI_API_KEY: "fake-local-test-key",
        OPENAI_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
        STUDY_ACCESS_TOKEN: token,
      },
      windowsHide: true,
      stdio: "pipe",
    },
  );
  let logs = "";
  processHandle.stdout?.on("data", (b) => (logs += b));
  processHandle.stderr?.on("data", (b) => (logs += b));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/session`);
      if (r.ok) {
        cookie = r.headers.get("set-cookie")!.split(";")[0];
        return;
      }
    } catch {}
    if (processHandle.exitCode !== null) throw new Error(logs);
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("test server startup timeout: " + logs);
});
after(async () => {
  processHandle?.kill();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  await new Promise((r) => setTimeout(r, 600));
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});
const call = (url: string, body?: unknown, method = body ? "POST" : "GET") =>
  fetch(base + url, {
    method,
    headers: {
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test("认证：未配对请求被拒绝、连接码配对、跨站写入阻断", async () => {
  assert.equal((await fetch(base + "/api/documents")).status, 401);
  const wrong = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "汉".repeat(token.length) }),
  });
  assert.equal(wrong.status, 401);
  const login = await call("/api/login", { token });
  assert.equal(login.status, 200);
  assert.ok(login.headers.get("set-cookie")?.includes("HttpOnly"));
  const cross = await fetch(base + "/api/settings", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({ model: "other" }),
  });
  assert.equal(cross.status, 403);
});
test("导入真实 PDF、提取页数、保存索引与读到的位置", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([500, 700]);
  pdf.addPage([500, 700]).setRotation(degrees(90));
  const bytes = await pdf.save();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), "two-pages.pdf");
  const result = await fetch(base + "/api/documents", {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  assert.equal(result.status, 200);
  const doc = await result.json();
  assert.equal(doc.pageCount, 2);
  assert.equal(doc.pages[1].width, 700);
  const updated = await (
    await call(
      `/api/documents/${doc.id}`,
      {
        currentPage: 2,
        pages: [{ number: 2, title: "独立第二页", text: "第二页知识点" }],
      },
      "PATCH",
    )
  ).json();
  assert.equal(updated.currentPage, 2);
  assert.equal(updated.pages[0].text, "");
  assert.equal(updated.pages[1].text, "第二页知识点");
  const imported = await PDFDocument.load(
    await (await call(`/api/documents/${doc.id}/pdf`)).arrayBuffer(),
  );
  assert.equal(imported.getPageCount(), 2);
});
test("流式讲解携带本页选区和图片，逐页隔离，多轮记录持久保存", async () => {
  const result = await call("/api/documents/demo/pages/3/chat", {
    question: "为什么先快后慢？",
    quote: "遗忘曲线",
    image: "data:image/jpeg;base64,/9j/2Q==",
  });
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type")!, /text\/event-stream/);
  const text = await result.text();
  assert.match(text, /先理解/);
  assert.match(text, /再回忆/);
  assert.match(text, /event: done/);
  assert.equal(requestBody.store, false);
  assert.match(JSON.stringify(requestBody.input), /第 3\/5 页/);
  assert.match(JSON.stringify(requestBody.input), /input_image/);
  assert.match(JSON.stringify(requestBody.input), /遗忘曲线/);
  const doc = await (await call("/api/documents/demo")).json();
  assert.equal(doc.pages[2].messages.length, 2);
  assert.equal(doc.pages[2].messages[1].text, "先理解，再回忆。");
  assert.equal(doc.pages[2].messages[1].status, "complete");
  assert.equal(doc.pages[1].messages.length, 0);
});
test("GPT 工具调用将中文批注保存到当前页和选区", async () => {
  modelMode = "annotation";
  const rects = [{ x: 0.2, y: 0.3, width: 0.2, height: 0.04 }];
  const response = await call("/api/documents/demo/pages/3/chat", {
    question: "请把重点批注到本页",
    quote: "主动回忆",
    rects,
  });
  const text = await response.text();
  assert.match(text, /event: annotation/);
  const doc = await (await call("/api/documents/demo")).json();
  assert.equal(doc.pages[2].annotations.length, 1);
  assert.deepEqual(doc.pages[2].annotations[0].rects, rects);
  modelMode = "normal";
});
test("批注坐标校验、删除、Markdown 包含中文讲解与批注", async () => {
  assert.equal(
    (
      await call("/api/documents/demo/pages/3/annotations", {
        kind: "note",
        text: "invalid",
        rects: [{ x: 2, y: 0, width: 0.1, height: 0.1 }],
        color: "#ead989",
      })
    ).status,
    400,
  );
  const response = await call("/api/documents/demo/pages/2/annotations", {
    kind: "note",
    text: "只出现在第二页",
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }],
    color: "#ead989",
  });
  const note = await response.json();
  assert.ok(note.id);
  const markdown = await (await call("/api/documents/demo/export")).text();
  assert.match(markdown, /只出现在第二页/);
  assert.match(markdown, /先理解，再回忆/);
  await call(
    `/api/documents/demo/pages/2/annotations/${note.id}`,
    undefined,
    "DELETE",
  );
  assert.equal(
    (await (await call("/api/documents/demo")).json()).pages[1].annotations
      .length,
    0,
  );
});
test("API 拒绝时不会报告成功，错误保存到当前页", async () => {
  modelMode = "unauthorized";
  const response = await call("/api/documents/demo/pages/4/chat", {
    question: "测试无效 Key",
  });
  const text = await response.text();
  assert.match(text, /event: error/);
  assert.match(text, /API Key 无效/);
  assert.doesNotMatch(text, /event: done/);
  const doc = await (await call("/api/documents/demo")).json();
  assert.equal(doc.pages[3].messages[1].status, "error");
  modelMode = "normal";
});

test("停止生成会保留已收到的讲解，同一页并发提问会被拒绝", async () => {
  modelMode = "slow";
  const controller = new AbortController();
  const response = await fetch(base + "/api/documents/demo/pages/1/chat", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "测试停止讲解" }),
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  let received = "";
  while (!received.includes("先理解")) {
    const { value, done } = await reader.read();
    if (done) break;
    received += new TextDecoder().decode(value);
  }
  assert.match(received, /先理解/);
  assert.equal((await call("/api/documents/demo/pages/1/chat", { question: "重复请求" })).status, 409);
  controller.abort();
  await reader.cancel().catch(() => {});
  let answer: any;
  for (let i = 0; i < 30; i++) {
    answer = (await (await call("/api/documents/demo")).json()).pages[0].messages.at(-1);
    if (answer.status === "interrupted") break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(answer.status, "interrupted");
  assert.match(answer.text, /先理解/);
  modelMode = "normal";
});
test("MCP HTTP 验证鉴权和真实工具列表", async () => {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "pagemate-tests", version: "1" },
    },
  };
  assert.equal((await call("/mcp", payload)).status, 401);
  const result = await fetch(base + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  assert.equal(result.status, 200);
  assert.match(await result.text(), /pagemate/);
});
test("MCP stdio 客户端可读取同一学习库中的问答与批注", async () => {
  const client = new Client({ name: "test-client", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "server/mcp.ts"),
    ],
    cwd: root,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => typeof e[1] === "string",
        ),
      ),
      DATA_DIR: dir,
    },
  });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 2);
  const result = await client.callTool({
    name: "read_study_notes",
    arguments: { documentId: "demo", page: 3 },
  });
  assert.match(JSON.stringify(result), /先理解，再回忆/);
  assert.match(JSON.stringify(result), /主动回忆/);
  await client.close();
});
test(
  "真实 PPTX 经过本机 PowerPoint/LibreOffice 转成逐页 PDF",
  { timeout: 130000 },
  async (t) => {
    const status = await (await call("/api/status")).json();
    if (!status.conversion) {
      t.skip("本机未安装 PowerPoint / LibreOffice");
      return;
    }
    const form = new FormData();
    form.append(
      "file",
      new Blob([
        readFileSync(path.join(root, "tests/fixtures/two-slides.pptx")),
      ]),
      "two-slides.pptx",
    );
    const response = await fetch(base + "/api/documents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    const doc = await response.json();
    assert.equal(response.status, 200, JSON.stringify(doc));
    assert.equal(doc.pageCount, 2);
    assert.equal(doc.type, "pptx");
    const pdf = await PDFDocument.load(
      await (await call(`/api/documents/${doc.id}/pdf`)).arrayBuffer(),
    );
    assert.equal(pdf.getPageCount(), 2);
  },
);
