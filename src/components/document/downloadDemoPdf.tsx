import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PDFDocument } from 'pdf-lib';
import type { RequestRecord } from '../../types';
import { getRequestDocumentVersion, RequestDocument } from './RequestDocument';

/** Demo data stays in this browser. Each PDF page is a picture of the form. */
export async function createDemoDocumentPdf(request: RequestRecord, version: number): Promise<Blob> {
  const document = getRequestDocumentVersion(request, version);
  if (!document) throw new Error('The selected document version is unavailable.');
  const { default: html2canvas } = await import('html2canvas-pro');
  const host = window.document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:190mm;background:white;color:black;z-index:-1';
  window.document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<RequestDocument {...document} print />));
    await window.document.fonts.ready;
    const element = host.firstElementChild as HTMLElement | null;
    if (!element) throw new Error('The form could not be rendered.');
    await Promise.all(Array.from(element.querySelectorAll('img'), image => image.decode().catch(() => undefined)));
    if (request.formType === 'R&D Initiative') {
      const pdf = await PDFDocument.create();
      for (const sheet of element.querySelectorAll<HTMLElement>('.a4-sheet')) {
        // Capture each sheet at the same origin. Capturing a second sheet below a fixed
        // off-screen host can omit its upper content in browser canvas rendering.
        const capture = window.document.createElement('div');
        capture.className = 'rnd-document';
        capture.style.cssText = 'position:absolute;left:-10000px;top:0;background:white';
        capture.appendChild(sheet.cloneNode(true));
        window.document.body.appendChild(capture);
        let canvas: HTMLCanvasElement;
        try {
          canvas = await html2canvas(capture.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#ffffff', logging: false });
        } finally { capture.remove(); }
        const nominalHeight = Math.round(canvas.width * 297 / 210);
        // Browser rounding and sheet borders can add a few pixels; do not create a blank tail page.
        const pagePixels = canvas.height <= nominalHeight + 32 ? canvas.height : nominalHeight;
        for (let offset = 0; offset < canvas.height; offset += pagePixels) {
          const slice = window.document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = Math.min(pagePixels, canvas.height - offset);
          const context = slice.getContext('2d');
          if (!context) throw new Error('The R&D document could not be rendered.');
          context.drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
          const image = await pdf.embedPng(slice.toDataURL('image/png'));
          const height = Math.min(841.89, slice.height * 595.28 / canvas.width);
          pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 841.89 - height, width: 595.28, height });
        }
      }
      return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
    }
    const landscape = request.formType === 'Cash Voucher';
    if (landscape) {
      host.style.width = '277mm';
      element.style.width = '100%';
    }
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const pdf = await PDFDocument.create();
    const pageWidth = landscape ? 841.89 : 595.28;
    const pageHeight = landscape ? 595.28 : 841.89;
    const margin = 28.35;
    const contentWidth = pageWidth - margin * 2;
    const maxPixels = Math.floor(canvas.width * (pageHeight - margin * 2) / contentWidth);
    const bounds = element.getBoundingClientRect();
    const protectedSections = Array.from(element.querySelectorAll('.avoid-page-break, .it-document-signatures, .it-document-remarks'))
      .map(section => {
        const rect = section.getBoundingClientRect();
        return { top: Math.floor((rect.top - bounds.top) * 2), bottom: Math.ceil((rect.bottom - bounds.top) * 2) };
      });
    let offset = 0;
    while (offset < canvas.height) {
      let end = Math.min(offset + maxPixels, canvas.height);
      const protectedSection = protectedSections.find(section => section.top > offset && section.top < end && section.bottom > end);
      if (protectedSection) end = protectedSection.top;
      if (end < canvas.height && !protectedSection) {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('The PDF could not be rendered.');
        const lowerBound = Math.max(offset + Math.floor(maxPixels * 0.7), end - 150);
        for (let y = end; y > lowerBound; y--) {
          const pixels = context.getImageData(4, y, Math.max(1, canvas.width - 8), 1).data;
          let dark = 0;
          for (let x = 0; x < pixels.length; x += 4) if (pixels[x] < 210 && pixels[x + 1] < 210 && pixels[x + 2] < 210) dark++;
          if (dark < canvas.width * 0.015) { end = y; break; }
        }
      }
      const pageCanvas = window.document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = end - offset;
      const pageContext = pageCanvas.getContext('2d');
      if (!pageContext || pageCanvas.height <= 0) throw new Error('The PDF could not be paginated.');
      pageContext.drawImage(canvas, 0, offset, canvas.width, pageCanvas.height, 0, 0, canvas.width, pageCanvas.height);
      const image = await pdf.embedPng(pageCanvas.toDataURL('image/png'));
      const height = pageCanvas.height * contentWidth / canvas.width;
      pdf.addPage([pageWidth, pageHeight]).drawImage(image, { x: margin, y: pageHeight - margin - height, width: contentWidth, height });
      offset = end;
    }
    return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
  } finally {
    root.unmount();
    host.remove();
  }
}
