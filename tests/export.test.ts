import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFDict, PDFName, PDFHexString, degrees } from "pdf-lib";
import { annotatedPdf } from "../src/export-pdf.ts";
import type { StudyDocument } from "../src/types.ts";

test("导出的标准 PDF 评论保存完整中文，多页高亮和笔迹可重新读取", async () => {
  const original = await PDFDocument.create();
  original.addPage([600, 400]);
  original.addPage([400, 600]).setRotation(degrees(90));
  const bytes = await original.save();
  const source: any = {
    getData: async () => bytes,
    getPage: async (n: number) => ({
      getViewport: () =>
        n === 1
          ? {
              width: 600,
              height: 400,
              convertToPdfPoint: (x: number, y: number) => [x, 400 - y],
            }
          : {
              width: 600,
              height: 400,
              convertToPdfPoint: (x: number, y: number) => [y, x],
            },
    }),
  };
  const doc: StudyDocument = {
    id: "test",
    name: "课件.pdf",
    type: "pdf",
    pageCount: 2,
    currentPage: 1,
    createdAt: "",
    updatedAt: "",
    pages: [1, 2].map((number) => ({
      number,
      width: 600,
      height: 400,
      text: "",
      title: "",
      messages: [],
      annotations:
        number === 1
          ? [
              {
                id: "note",
                page: 1,
                createdAt: "",
                kind: "note",
                text: "记忆保持率：先快后慢\n这里是中文批注。",
                color: "#ead989",
                rects: [{ x: 0.2, y: 0.3, width: 0.1, height: 0.05 }],
              },
            ]
          : [
              {
                id: "ink",
                page: 2,
                createdAt: "",
                kind: "ink",
                text: "",
                color: "#416b58",
                rects: [],
                points: [
                  { x: 0.1, y: 0.2 },
                  { x: 0.3, y: 0.4 },
                ],
              },
            ],
    })),
  };
  const blob = await annotatedPdf(doc, source),
    output = await PDFDocument.load(await blob.arrayBuffer());
  assert.equal(output.getPageCount(), 2);
  assert.equal(output.getPage(1).getRotation().angle, 90);
  const refs = output.getPage(0).node.Annots()!;
  assert.equal(refs.size(), 1);
  const note = output.context.lookup(refs.get(0), PDFDict);
  assert.equal(
    note.lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
    "记忆保持率：先快后慢\n这里是中文批注。",
  );
  assert.equal(note.get(PDFName.of("Subtype"))?.toString(), "/Text");
  assert.ok(output.getPage(1).node.Contents());
});
