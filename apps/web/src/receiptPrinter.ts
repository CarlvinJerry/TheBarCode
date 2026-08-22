const bridgeUrl = "http://127.0.0.1:17777";

export async function listSilentPrinters(): Promise<string[]> {
  const response = await fetch(`${bridgeUrl}/printers`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error("Print bridge unavailable");
  return response.json();
}

export async function silentPrint(text: string): Promise<boolean> {
  const printerName = localStorage.getItem("receipt_printer");
  if (!printerName || localStorage.getItem("silent_print") !== "true") return false;
  const response = await fetch(`${bridgeUrl}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printerName, text, charactersPerLine: 48, cut: localStorage.getItem("receipt_cut") === "true" }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || "Silent printing failed");
  return true;
}

export async function printReceiptText(text: string) {
  try {
    if (await silentPrint(text)) return "silent" as const;
  } catch (error) {
    console.warn("Silent printer unavailable; opening print preview", error);
  }
  printReceiptPreview(text);
  return "preview" as const;
}

function printReceiptPreview(text: string) {
  const frame = document.createElement("iframe");
  frame.title = "Receipt print job";
  Object.assign(frame.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    left: "-10000px",
  });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Unable to create receipt print job");
  }
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
    @page { size: 80mm auto; margin: 0; }
    html,body { margin:0; padding:0; width:80mm; background:#fff; }
    body { box-sizing:border-box; padding:3mm 5mm 5mm; color:#000; }
    pre { margin:0; width:70mm; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere; font:9pt/1.35 "Courier New",monospace; }
  </style></head><body><pre>${escaped}</pre></body></html>`);
  doc.close();
  const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
  frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    cleanup();
  }, 250);
}

export function testReceiptText() {
  const institution = localStorage.getItem("business_name") || "The BarCode";
  const footer =
    localStorage.getItem("receipt_footer") || "Thank you. Drink responsibly.";
  return `${institution.toUpperCase()}\nPRINTER TEST\n${new Date().toLocaleString()}\n------------------------------------------------\nXPRINTER XP-80 / 80 MM\nDIRECT ESC/POS TEST\n------------------------------------------------\n${footer}`;
}
