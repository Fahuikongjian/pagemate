import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Store } from "./store.ts";
const chapters = [
  {
    title: "学习，是让知识留下来",
    sub: "从「看过」到「真正掌握」",
    text: [
      "认知心理学 · 第 03 讲",
      "学习与记忆",
      "我们每天接触很多信息，但只有一部分会成为长期记忆。",
      "理解记忆如何形成，才能把学习变得更轻松、更有效。",
      "本讲路线：记忆的过程 → 遗忘曲线 → 间隔复习 → 主动回忆",
    ],
  },
  {
    title: "记忆，是一个加工过程",
    sub: "编码 · 存储 · 提取",
    text: [
      "编码：把新信息转换为大脑能够理解的形式。",
      "存储：通过巩固，让信息在较长时间内保持。",
      "提取：在需要的时候，把知识重新带回意识。",
      "把知识与已有经验联系起来，比反复浏览更有助于理解。",
    ],
  },
  {
    title: "遗忘有规律，复习有方法",
    sub: "THE FORGETTING CURVE",
    text: [
      "遗忘曲线：遗忘在学习后很快发生，随后逐渐放缓。",
      "记忆保持率随时间下降；及时复习可以帮助巩固记忆。",
      "复习的价值，不是把同一页多看几遍，而是在快要忘记时重新提取。",
      "提示：曲线是概念示意，个体差异、材料难度和学习方法都会影响遗忘速度。",
    ],
  },
  {
    title: "把复习，放在合适的时间",
    sub: "SPACED REPETITION",
    text: [
      "间隔复习：把学习分散到多个时段，而不是集中在同一晚。",
      "示例安排：学习当天 → 第 2 天 → 第 4 天 → 第 7 天。",
      "能轻松回忆，就拉长间隔；回忆困难，就缩短间隔。",
      "这些时间只是起点，应根据你自己的掌握程度调整。",
    ],
  },
  {
    title: "合上课件，你还记得什么？",
    sub: "ACTIVE RECALL",
    text: [
      "主动回忆：先尝试从记忆中提取答案，再查看课件核对。",
      "用自己的话解释概念；画一张思维导图；出一道小测验。",
      "练习 01：为什么「看起来很熟悉」不等于「已经掌握」？",
      "练习 02：给下一周设计一个适合你的复习计划。",
    ],
  },
];
export async function ensureDemo(store: Store, dir: string) {
  if (
    store.get("demo") &&
    existsSync(path.join(dir, "demo.pdf")) &&
    existsSync(path.join(dir, "demo-font-v4"))
  )
    return;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // This static font is already subset with fontTools; avoid fontkit's CJK subset mapping issue.
  const font = await pdf.embedFont(
    readFileSync(path.resolve("assets/PageMateDemoSans.ttf")),
    { subset: false },
  );
  const green = rgb(0.18, 0.33, 0.27),
    ink = rgb(0.17, 0.22, 0.2),
    muted = rgb(0.39, 0.44, 0.41),
    gold = rgb(0.75, 0.58, 0.27);
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i],
      page = pdf.addPage([960, 600]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 960,
      height: 600,
      color: rgb(0.995, 0.99, 0.965),
    });
    const t = (text: string, x: number, y: number, size: number, color = ink) =>
      page.drawText(text, { x, y, size, font, color });
    t("认知心理学 / 学习与记忆", 64, 548, 13, muted);
    t(`03 / ${String(i + 1).padStart(2, "0")}`, 816, 548, 13, muted);
    page.drawLine({
      start: { x: 64, y: 524 },
      end: { x: 896, y: 524 },
      color: rgb(0.83, 0.86, 0.81),
      thickness: 1,
    });
    t(c.sub, 64, 477, 13, green);
    t(c.title, 64, 427, 34, green);
    if (i === 2) {
      const x0 = 98,
        y0 = 184;
      t("记忆保持率", 84, 380, 12, muted);
      [0, 0.5, 1].forEach((v) => {
        const y = y0 + v * 168;
        page.drawLine({
          start: { x: x0, y },
          end: { x: 564, y },
          thickness: 0.7,
          color: rgb(0.85, 0.88, 0.84),
        });
        t(`${v * 100}%`, 58, y - 4, 10, muted);
      });
      const pts = Array.from({ length: 61 }, (_, j) => ({
        x: x0 + j * 7.7,
        y: y0 + (0.2 + 0.8 * Math.exp(-j / 11)) * 168,
      }));
      pts
        .slice(1)
        .forEach((p, j) =>
          page.drawLine({ start: pts[j], end: p, color: green, thickness: 3 }),
        );
      ["刚学完", "1 天", "2 天", "7 天"].forEach((v, j) =>
        t(v, x0 + j * 146 - 12, 162, 11, muted),
      );
      page.drawCircle({ x: pts[11].x, y: pts[11].y, size: 6, color: gold });
      t("先快后慢", 337, 304, 19, green);
      t("遗忘速度逐渐放缓", 337, 280, 12, muted);
      page.drawRectangle({
        x: 620,
        y: 206,
        width: 276,
        height: 168,
        color: rgb(0.93, 0.95, 0.9),
      });
      t("把握复习的时机", 642, 339, 20, green);
      t("在遗忘发生后，主动提取。", 642, 303, 14);
      t("每一次回忆，都在巩固记忆。", 642, 275, 14);
      t("理解规律，而不是机械重复。", 642, 238, 13, muted);
      t("复习的价值，是在快要忘记时重新提取。", 98, 113, 18, green);
      t("概念示意 · 曲线随材料、个体与学习方法而变化", 98, 84, 11, muted);
    } else if (i === 1) {
      ["01  编码", "02  存储", "03  提取"].forEach((text, j) => {
        page.drawRectangle({
          x: 64 + j * 282,
          y: 260,
          width: 260,
          height: 110,
          color: rgb(0.92 + j * 0.015, 0.95, 0.9),
        });
        t(text, 90 + j * 282, 321, 25, green);
        t(c.text[j].slice(3), 82 + j * 282, 283, 12);
      });
      t(c.text[3], 64, 190, 19, green);
    } else {
      c.text.forEach((text, j) => {
        t(String(j + 1).padStart(2, "0"), 64, 350 - j * 58, 13, gold);
        t(
          text,
          104,
          350 - j * 58,
          i === 0 && j === 1 ? 27 : 17,
          j === 0 ? green : ink,
        );
      });
    }
    t("PAGEMATE  /  LEARN WITH UNDERSTANDING", 64, 35, 9, muted);
    t(String(i + 1).padStart(2, "0"), 871, 35, 10, muted);
  }
  writeFileSync(path.join(dir, "demo.pdf"), await pdf.save());
  writeFileSync(path.join(dir, "demo-font-v4"), "1");
  const now = new Date().toISOString();
  const previous = store.get("demo");
  store.save({
    id: "demo",
    name: "学习与记忆 · 认知心理学.pdf",
    type: "pdf",
    pageCount: 5,
    currentPage: previous?.currentPage || 3,
    demo: true,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    pages: chapters.map((c, i) => ({
      number: i + 1,
      title: c.title,
      text: [c.title, c.sub, ...c.text].join("\n"),
      width: 960,
      height: 600,
      messages: previous?.pages[i]?.messages || [],
      annotations: previous?.pages[i]?.annotations || [],
    })),
  });
}
