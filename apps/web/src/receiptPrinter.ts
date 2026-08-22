export function printReceiptText(text: string) {
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
    @page { size: 58mm auto; margin: 0; }
    html,body { margin:0; padding:0; width:58mm; background:#fff; }
    body { box-sizing:border-box; padding:3mm 4mm 5mm; color:#000; }
    pre { margin:0; width:50mm; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere; font:9pt/1.35 "Courier New",monospace; }
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
  return `${institution.toUpperCase()}\nPRINTER TEST\n${new Date().toLocaleString()}\n----------------------------\nXP-P5 / 58 MM\nUSB OR BLUETOOTH\n----------------------------\n${footer}`;
}
