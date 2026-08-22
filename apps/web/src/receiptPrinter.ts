const bridgeUrl = "http://127.0.0.1:17777";
export type ReceiptSettings = {paperWidthMm:number;showBusinessDetails:boolean;showCustomer:boolean;showCashier:boolean;showTax:boolean;showCustomerBalance:boolean;showPoweredBy:boolean;autoPrintPaidSale:boolean;creditSalePrintMode:string;paymentReceiptPrintMode:string;copies:number;footer:string;receiptPrefix:string;invoicePrefix:string;paymentPrefix:string};
export type OrganizationSettings = {name:string;legalName?:string;industryProfile:string;currency:string;phone?:string;email?:string;address?:string;taxPin?:string;vatNumber?:string;tagline?:string};
export const defaultReceiptSettings:ReceiptSettings={paperWidthMm:80,showBusinessDetails:true,showCustomer:true,showCashier:true,showTax:false,showCustomerBalance:true,showPoweredBy:true,autoPrintPaidSale:false,creditSalePrintMode:"Optional",paymentReceiptPrintMode:"Optional",copies:1,footer:"Thank you for your business.",receiptPrefix:"RCP",invoicePrefix:"INV",paymentPrefix:"PAY"};
export const defaultOrganizationSettings:OrganizationSettings={name:"The BarCode",industryProfile:"BarCafe",currency:"KES",tagline:"Smart business operations"};
export function cachedReceiptSettings():ReceiptSettings{try{return {...defaultReceiptSettings,...JSON.parse(localStorage.getItem("receipt_configuration")||"{}")} }catch{return defaultReceiptSettings}}
export function cachedOrganizationSettings():OrganizationSettings{try{return {...defaultOrganizationSettings,...JSON.parse(localStorage.getItem("organization_profile")||"{}")} }catch{return defaultOrganizationSettings}}

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
    body: JSON.stringify({ printerName, text, charactersPerLine: cachedReceiptSettings().paperWidthMm===58?32:48, cut: localStorage.getItem("receipt_cut") === "true" }),
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
  const width=cachedReceiptSettings().paperWidthMm;
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
    @page { size: ${width}mm auto; margin: 0; }
    html,body { margin:0; padding:0; width:${width}mm; background:#fff; }
    body { box-sizing:border-box; padding:3mm 5mm 5mm; color:#000; }
    pre { margin:0; width:${width-10}mm; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere; font:9pt/1.35 "Courier New",monospace; }
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
  const organization=cachedOrganizationSettings(),receipt=cachedReceiptSettings(),line="-".repeat(receipt.paperWidthMm===58?32:48);
  return `${organization.name.toUpperCase()}\nPRINTER TEST\n${new Date().toLocaleString()}\n${line}\nCONFIGURED ${receipt.paperWidthMm} MM\nDIRECT ESC/POS TEST\n${line}\n${receipt.footer}${receipt.showPoweredBy?"\nPowered by Beyond Raw Data":""}`;
}

export function buildSaleReceipt(input:{id:string;customerName:string;cashierName:string;method:string;credit:boolean;items:{name:string;quantity:number;unitPrice:number}[];total:number}){
 const org=cachedOrganizationSettings(),cfg=cachedReceiptSettings(),branch=localStorage.getItem("branch_name")||"Main branch",terminal=localStorage.getItem("device_id")||"POS-01",cols=cfg.paperWidthMm===58?32:48,line="-".repeat(cols),money=(n:number)=>`${org.currency} ${n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`,rows:string[]=[];
 rows.push(org.name.toUpperCase());if(org.legalName&&org.legalName!==org.name)rows.push(org.legalName);if(org.tagline)rows.push(org.tagline);
 if(cfg.showBusinessDetails){if(org.address)rows.push(org.address);if(org.phone)rows.push(`Tel: ${org.phone}`);if(org.taxPin)rows.push(`PIN: ${org.taxPin}`);rows.push(`Branch: ${branch}`)}
 rows.push(line,input.credit?"CREDIT SALE":"SALES RECEIPT",`${cfg.receiptPrefix}-${input.id.slice(0,8).toUpperCase()}`,new Date().toLocaleString(),`Till: ${terminal}`);
 if(cfg.showCashier)rows.push(`Cashier: ${input.cashierName}`);if(cfg.showCustomer)rows.push(`Customer: ${input.customerName}`);rows.push(line);
 for(const item of input.items){rows.push(item.name);rows.push(`${item.quantity} x ${money(item.unitPrice)}  ${money(item.quantity*item.unitPrice)}`)}
 rows.push(line,`TOTAL: ${money(input.total)}`,input.credit?`PAID: ${money(0)}\nBALANCE: ${money(input.total)}\nSTATUS: UNPAID / CREDIT`:`PAYMENT: ${input.method.toUpperCase()}\nSTATUS: PAID`,line,cfg.footer);if(cfg.showPoweredBy)rows.push("Powered by Beyond Raw Data");return rows.join("\n");
}
