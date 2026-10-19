import { PDFDocument, PDFName, PDFHexString, rgb } from "pdf-lib";
import type { PDFDocumentProxy } from "./pdf";
import type { StudyDocument } from "./types";
export async function annotatedPdf(
  doc: StudyDocument,
  source: PDFDocumentProxy,
) {
  const data = await source.getData(),
    output = await PDFDocument.load(data);
  for (const p of doc.pages) {
    const target = output.getPage(p.number - 1),
      original = await source.getPage(p.number),
      viewport = original.getViewport({ scale: 1 });
    const toPdf = (x: number, y: number) =>
      viewport.convertToPdfPoint(x * viewport.width, y * viewport.height);
    for (const a of p.annotations) {
      const c = a.color.replace("#", ""),
        color = rgb(
          parseInt(c.slice(0, 2), 16) / 255,
          parseInt(c.slice(2, 4), 16) / 255,
          parseInt(c.slice(4, 6), 16) / 255,
        );
      if (a.kind === "ink") {
        a.points?.slice(1).forEach((point, i) => {
          const [x1, y1] = toPdf(a.points![i].x, a.points![i].y),
            [x2, y2] = toPdf(point.x, point.y);
          target.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            color,
            thickness: 1.8,
          });
        });
        continue;
      }
      for (const r of a.rects) {
        const [x1, y1] = toPdf(r.x, r.y),
          [x2, y2] = toPdf(r.x + r.width, r.y + r.height);
        target.drawRectangle({
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          color,
          opacity: 0.3,
        });
      }
      if (a.text) {
        const r = a.rects[0] || { x: 0.88, y: 0.14 },
          [x, y] = toPdf(r.x, r.y);
        const annotation = output.context.obj({
          Type: PDFName.of("Annot"),
          Subtype: PDFName.of("Text"),
          Rect: [x, y - 20, x + 20, y],
          Contents: PDFHexString.fromText(a.text),
          T: PDFHexString.fromText("页伴学习批注"),
          Name: PDFName.of("Comment"),
          C: [color.red, color.green, color.blue],
          Open: false,
          F: 4,
        });
        target.node.addAnnot(output.context.register(annotation));
      }
    }
  }
  return new Blob([new Uint8Array(await output.save())], {
    type: "application/pdf",
  });
}
