import {
  getReportFileExtension,
  getReportMimeType,
  serializeReport
} from "./serializeReport";

function buildReportFilename(format) {
  const datePart = new Date().toISOString().slice(0, 10);
  const extension = getReportFileExtension(format);

  return `flora35-report-${datePart}.${extension}`;
}

/** Скачивает отчёт в браузере через временную ссылку. */
export function downloadReportFile(payload, format) {
  const content = serializeReport(payload, format);
  const mimeType = getReportMimeType(format);
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = buildReportFilename(format);
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
