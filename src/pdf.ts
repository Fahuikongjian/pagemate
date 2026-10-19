import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = worker;
export { TextLayer } from "pdfjs-dist";
export type { PDFDocumentProxy } from "pdfjs-dist";
export const openPdf = (id: string) =>
  getDocument({
    url: `/api/documents/${id}/pdf`,
    enableXfa: false,
    cMapUrl: "/pdf-assets/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdf-assets/standard_fonts/",
    wasmUrl: "/pdf-assets/wasm/",
  });
