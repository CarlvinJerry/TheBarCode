const bridgeUrl = "http://127.0.0.1:17777";
export type ReceiptSettings = {paperWidthMm:number;showBusinessDetails:boolean;showCustomer:boolean;showCashier:boolean;showTax:boolean;showCustomerBalance:boolean;showPoweredBy:boolean;autoPrintPaidSale:boolean;creditSalePrintMode:string;paymentReceiptPrintMode:string;copies:number;footer:string;receiptPrefix:string;invoicePrefix:string;paymentPrefix:string};
export type OrganizationSettings = {name:string;legalName?:string;industryProfile:string;businessCategory?:string;enabledModules?:string;profileConfigured?:boolean;planCode?:string;billingStatus?:string;trialEndsAt?:string;deploymentMode?:string;branchLimit?:number;terminalLimit?:number;userLimit?:number;currency:string;phone?:string;email?:string;address?:string;taxPin?:string;vatNumber?:string;tagline?:string};
export const defaultReceiptSettings:ReceiptSettings={paperWidthMm:80,showBusinessDetails:true,showCustomer:true,showCashier:true,showTax:false,showCustomerBalance:true,showPoweredBy:true,autoPrintPaidSale:false,creditSalePrintMode:"Optional",paymentReceiptPrintMode:"Optional",copies:1,footer:"Thank you for your business.",receiptPrefix:"RCP",invoicePrefix:"INV",paymentPrefix:"PAY"};
export const defaultOrganizationSettings:OrganizationSettings={name:"TheBarcode",industryProfile:"Hospitality",businessCategory:"BarCafe",enabledModules:"sales,inventory,expenses,reports,ai,production,accounting",profileConfigured:false,planCode:"OpenPreview",billingStatus:"Trial",deploymentMode:"Local",branchLimit:99,terminalLimit:99,userLimit:99,currency:"KES",tagline:"Smarter Business Operations"};
export function cachedReceiptSettings():ReceiptSettings{try{return {...defaultReceiptSettings,...JSON.parse(localStorage.getItem("receipt_configuration")||"{}")} }catch{return defaultReceiptSettings}}
export function cachedOrganizationSettings():OrganizationSettings{try{return {...defaultOrganizationSettings,...JSON.parse(localStorage.getItem("organization_profile")||"{}")} }catch{return defaultOrganizationSettings}}

export async function listSilentPrinters(): Promise<string[]> {
  const response = await fetch(`${bridgeUrl}/printers`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error("Print bridge unavailable");
  return response.json();
}

export async function getPrinterQueue(printerName: string): Promise<string[]> {
  const response = await fetch(`${bridgeUrl}/queue?printerName=${encodeURIComponent(printerName)}`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error("Print bridge unavailable");
  const value = await response.json();
  return Array.isArray(value.jobs) ? value.jobs : [];
}

export async function clearPrinterQueue(printerName: string): Promise<number> {
  const response = await fetch(`${bridgeUrl}/queue/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printerName, scope: "TheBarcode", confirm: true }),
    signal: AbortSignal.timeout(6000),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value?.detail || "Unable to clear TheBarcode print jobs");
  return Number(value?.removed || 0);
}

export async function silentPrint(text: string): Promise<boolean> {
  const printerName = localStorage.getItem("receipt_printer");
  // Older terminal profiles may have a printer saved without the newer
  // silent_print preference. Treat that as silent printing enabled; only an
  // explicit false means the operator asked for the Windows dialog.
  if (!printerName || localStorage.getItem("silent_print") === "false") return false;
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
  const columns=width===58?32:48;
  // Chromium does not consistently accept `auto` as a thermal page height.
  // It then falls back to Letter/A4 and scales the receipt past the roll width.
  const wrappedLines=text.split("\n").reduce((count,line)=>count+Math.max(1,Math.ceil(line.length/columns)),0);
  const height=Math.max(70,Math.min(600,Math.ceil(wrappedLines*4.2+12)));
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
    .replaceAll(">", "&gt;")
    .split("\n").map(line=>{
      const trimmed=line.trim();
      if(trimmed.startsWith("STATUS: ")) return `<strong>${line}</strong>`;
      if(trimmed.startsWith("BALANCE: ")) return `<span class="receipt-balance">${line}</span>`;
      if(trimmed.startsWith("DEPOSIT: ")||trimmed.startsWith("PAID: ")) return `<span class="receipt-deposit">${line}</span>`;
      return trimmed==="Powered by TheBarcode | Beyond Raw Data"?`<small>${line}</small>`:line;
    }).join("\n");
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
    @page { size: ${width}mm ${height}mm; margin: 0; }
    html,body { margin:0; padding:0; width:${width}mm; max-width:${width}mm; background:#fff; }
    body { box-sizing:border-box; padding:3mm 4mm 5mm; color:#000; overflow:hidden; }
    pre { box-sizing:border-box; margin:0; width:100%; max-width:100%; overflow:hidden; white-space:pre-wrap; overflow-wrap:anywhere; font:9pt/1.35 "Courier New",monospace; }
    strong { display:block; font-size:13pt; line-height:1.5; text-align:center; font-weight:900; }
    .receipt-balance { display:block; color:#b42318; font-weight:900; }
    .receipt-deposit { display:block; color:#176b4d; font-weight:800; }
    small { display:block; font-size:6.5pt; line-height:1.2; text-align:center; }
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
  const organization=cachedOrganizationSettings(),receipt=cachedReceiptSettings(),line="-".repeat(receipt.paperWidthMm===58?32:48),branch=localStorage.getItem("branch_name")||"Main branch",terminal=localStorage.getItem("device_id")||"POS-01";
  return `${organization.name.toUpperCase()}${organization.tagline?`\n${organization.tagline}`:""}${organization.address?`\n${organization.address}`:""}${organization.phone?`\nTel: ${organization.phone}`:""}\nBranch: ${branch}\n${line}\nPRINTER TEST\nTEST-0001\n${new Date().toLocaleString()}\nTill: ${terminal}\nPaper: ${receipt.paperWidthMm} mm\nSTATUS: TEST OK\n${line}\n${receipt.footer}${receipt.showPoweredBy?"\nPowered by TheBarcode | Beyond Raw Data":""}`;
}

function localNumbers(id:string,walkIn:boolean){const date=new Date().toISOString().slice(0,10),key=`receipt_numbers_${date}`;try{const data=JSON.parse(localStorage.getItem(key)||'{"order":0,"walkIn":0,"ids":{}}');if(!data.ids[id]){data.order++;if(walkIn)data.walkIn++;data.ids[id]={order:data.order,walkIn:walkIn?data.walkIn:null};localStorage.setItem(key,JSON.stringify(data))}return data.ids[id]}catch{return{order:1,walkIn:walkIn?1:null}}}
export function buildSaleReceipt(input:{id:string;dailyOrderNumber?:number;walkInNumber?:number|null;customerName:string;cashierName:string;method:string;status?:"UNPAID"|"PAID"|"CREDIT"|"PARTIAL";credit:boolean;paid?:number;items:{name:string;quantity:number;unitPrice:number}[];total:number}){
 const org=cachedOrganizationSettings(),cfg=cachedReceiptSettings(),branch=localStorage.getItem("branch_name")||"Main branch",terminal=localStorage.getItem("device_id")||"POS-01",cols=cfg.paperWidthMm===58?32:48,line="-".repeat(cols),money=(n:number)=>`${org.currency} ${n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`,rows:string[]=[];
 rows.push(org.name.toUpperCase());if(org.legalName&&org.legalName!==org.name)rows.push(org.legalName);if(org.tagline)rows.push(org.tagline);
 if(cfg.showBusinessDetails){if(org.address)rows.push(org.address);if(org.phone)rows.push(`Tel: ${org.phone}`);if(org.taxPin)rows.push(`PIN: ${org.taxPin}`);rows.push(`Branch: ${branch}`)}
 const status=input.status??(input.credit?"CREDIT":"PAID"),paid=Math.max(0,Math.min(input.total,input.paid??(status==="PAID"?input.total:0))),walkIn=input.customerName.toLowerCase().startsWith("walk-in"),numbers=input.dailyOrderNumber?{order:input.dailyOrderNumber,walkIn:input.walkInNumber}:localNumbers(input.id,walkIn);rows.push(line,status==="UNPAID"?"UNPAID BILL":status==="CREDIT"?"CREDIT SALE":status==="PARTIAL"?"ORDER DEPOSIT":"SALES RECEIPT",`${cfg.receiptPrefix}-${input.id.slice(0,8).toUpperCase()}`,`Order today: ${numbers.order}`,new Date().toLocaleString(),`Till: ${terminal}`);
 if(cfg.showCashier)rows.push(`Cashier: ${input.cashierName}`);if(cfg.showCustomer)rows.push(`Customer: ${walkIn&&numbers.walkIn?`Walk-in #${numbers.walkIn}`:input.customerName}`);rows.push(line);
 for(const item of input.items){rows.push(item.name);rows.push(`${item.quantity} x ${money(item.unitPrice)}  ${money(item.quantity*item.unitPrice)}`)}
 rows.push(line,`TOTAL: ${money(input.total)}`,status==="UNPAID"?`STATUS: UNPAID\nHELD - NOT A PAYMENT RECEIPT`:status==="CREDIT"?`PAID: ${money(paid)}\nBALANCE: ${money(input.total-paid)}\nSTATUS: CREDIT`:status==="PARTIAL"?`DEPOSIT: ${money(paid)}\nBALANCE: ${money(input.total-paid)}\nSTATUS: ORDER`:`PAYMENT: ${input.method.toUpperCase()}\nSTATUS: PAID`,line,cfg.footer);if(cfg.showPoweredBy)rows.push("Powered by TheBarcode | Beyond Raw Data");return rows.join("\n");
}
