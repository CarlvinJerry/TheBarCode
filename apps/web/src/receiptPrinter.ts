const desktopBridgePort = (window as any).chrome?.webview ? 17778 : Number(new URLSearchParams(location.search).get("printBridgePort")) || 17777;
const bridgeUrl = `http://127.0.0.1:${desktopBridgePort}`;
export type ReceiptSettings = {paperWidthMm:number;showBusinessDetails:boolean;showCustomer:boolean;showCashier:boolean;showTax:boolean;showCustomerBalance:boolean;showPoweredBy:boolean;autoPrintPaidSale:boolean;creditSalePrintMode:string;paymentReceiptPrintMode:string;copies:number;footer:string;receiptPrefix:string;invoicePrefix:string;paymentPrefix:string};
export type OrganizationSettings = {name:string;legalName?:string;industryProfile:string;businessCategory?:string;enabledModules?:string;profileConfigured?:boolean;planCode?:string;billingStatus?:string;trialEndsAt?:string;deploymentMode?:string;branchLimit?:number;terminalLimit?:number;userLimit?:number;currency:string;phone?:string;email?:string;address?:string;taxPin?:string;vatNumber?:string;tagline?:string};
export const defaultReceiptSettings:ReceiptSettings={paperWidthMm:80,showBusinessDetails:true,showCustomer:true,showCashier:true,showTax:false,showCustomerBalance:true,showPoweredBy:true,autoPrintPaidSale:false,creditSalePrintMode:"Optional",paymentReceiptPrintMode:"Optional",copies:1,footer:"Thank you for your business.",receiptPrefix:"RCP",invoicePrefix:"INV",paymentPrefix:"PAY"};
export const defaultOrganizationSettings:OrganizationSettings={name:"TheBarcode",industryProfile:"Hospitality",businessCategory:"BarCafe",enabledModules:"sales,inventory,expenses,reports,ai,production,accounting",profileConfigured:false,planCode:"OpenPreview",billingStatus:"Trial",deploymentMode:"Local",branchLimit:99,terminalLimit:99,userLimit:99,currency:"KES",tagline:"Smarter Business Operations"};
export function cachedReceiptSettings():ReceiptSettings{try{return {...defaultReceiptSettings,...JSON.parse(localStorage.getItem("receipt_configuration")||"{}")} }catch{return defaultReceiptSettings}}
export function cachedOrganizationSettings():OrganizationSettings{try{return {...defaultOrganizationSettings,...JSON.parse(localStorage.getItem("organization_profile")||"{}")} }catch{return defaultOrganizationSettings}}

export async function listSilentPrinters(): Promise<string[]> {
  const response = await fetch(`${bridgeUrl}/printers`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) {
    const problem=await response.json().catch(()=>null);
    throw new Error(problem?.detail||problem?.title||"Print bridge unavailable");
  }
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

export async function bridgePrint(text: string): Promise<void> {
  const printerName = localStorage.getItem("receipt_printer");
  if (!printerName) throw new Error("Choose and save a receipt printer in Settings before printing.");
  const response = await fetch(`${bridgeUrl}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printerName, text, charactersPerLine: cachedReceiptSettings().paperWidthMm===58?32:48, cut: localStorage.getItem("receipt_cut") === "true" }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || "The printer bridge rejected the receipt.");
}

export async function printReceiptText(text: string): Promise<void> {
  try {
    await bridgePrint(text);
  } catch (error) {
    console.warn("Configured receipt printer unavailable", error);
    const detail = error instanceof Error ? error.message : "The print service could not be reached.";
    throw new Error(`Receipt was not sent to the configured printer. ${detail} Check that the printer and TheBarcode print bridge are running, then retry.`);
  }
}

export function testReceiptText() {
  const organization=cachedOrganizationSettings(),receipt=cachedReceiptSettings(),line="-".repeat(receipt.paperWidthMm===58?32:48),branch=localStorage.getItem("branch_name")||"Main branch",terminal=localStorage.getItem("device_id")||"POS-01";
  return `${organization.name.toUpperCase()}${organization.tagline?`\n${organization.tagline}`:""}${organization.address?`\n${organization.address}`:""}${organization.phone?`\nTel: ${organization.phone}`:""}\nBranch: ${branch}\n${line}\nPRINTER TEST\nTEST-0001\n${new Date().toLocaleString()}\nTill: ${terminal}\nPaper: ${receipt.paperWidthMm} mm\nSTATUS: TEST OK\n${line}\n${receipt.footer}${receipt.showPoweredBy?"\nPowered by TheBarcode | Beyond Raw Data":""}`;
}

function localNumbers(id:string,walkIn:boolean){const date=new Date().toISOString().slice(0,10),key=`receipt_numbers_${date}`;try{const data=JSON.parse(localStorage.getItem(key)||'{"order":0,"walkIn":0,"ids":{}}');if(!data.ids[id]){data.order++;if(walkIn)data.walkIn++;data.ids[id]={order:data.order,walkIn:walkIn?data.walkIn:null};localStorage.setItem(key,JSON.stringify(data))}return data.ids[id]}catch{return{order:1,walkIn:walkIn?1:null}}}
export function buildSaleReceipt(input:{id:string;dailyOrderNumber?:number;walkInNumber?:number|null;customerName:string;cashierName:string;method:string;status?:"UNPAID"|"PAID"|"CREDIT"|"PARTIAL";credit:boolean;paid?:number;items:{name:string;quantity:number;unitPrice:number}[];total:number;occurredAt?:string|Date}){
 const org=cachedOrganizationSettings(),cfg=cachedReceiptSettings(),branch=localStorage.getItem("branch_name")||"Main branch",terminal=localStorage.getItem("device_id")||"POS-01",cols=cfg.paperWidthMm===58?32:48,line="-".repeat(cols),money=(n:number)=>`${org.currency} ${n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`,rows:string[]=[];
 rows.push(org.name.toUpperCase());if(org.legalName&&org.legalName!==org.name)rows.push(org.legalName);if(org.tagline)rows.push(org.tagline);
 if(cfg.showBusinessDetails){if(org.address)rows.push(org.address);if(org.phone)rows.push(`Tel: ${org.phone}`);if(org.taxPin)rows.push(`PIN: ${org.taxPin}`);rows.push(`Branch: ${branch}`)}
 const status=input.status??(input.credit?"CREDIT":"PAID"),paid=Math.max(0,Math.min(input.total,input.paid??(status==="PAID"?input.total:0))),walkIn=input.customerName.toLowerCase().startsWith("walk-in"),numbers=input.dailyOrderNumber?{order:input.dailyOrderNumber,walkIn:input.walkInNumber}:localNumbers(input.id,walkIn);rows.push(line,status==="UNPAID"?"UNPAID BILL":status==="CREDIT"?"CREDIT SALE":status==="PARTIAL"?"ORDER DEPOSIT":"SALES RECEIPT",`${cfg.receiptPrefix}-${input.id.slice(0,8).toUpperCase()}`,`Order no: ${numbers.order}`,new Date(input.occurredAt??Date.now()).toLocaleString(),`Till: ${terminal}`);
 if(cfg.showCashier)rows.push(`Cashier: ${input.cashierName}`);if(cfg.showCustomer)rows.push(`Customer: ${walkIn&&numbers.walkIn?`Walk-in #${numbers.walkIn}`:input.customerName}`);rows.push(line);
 for(const item of input.items){rows.push(item.name);rows.push(`${item.quantity} x ${money(item.unitPrice)}  ${money(item.quantity*item.unitPrice)}`)}
 rows.push(line,`TOTAL: ${money(input.total)}`,status==="UNPAID"?`STATUS: UNPAID\nHELD - NOT A PAYMENT RECEIPT`:status==="CREDIT"?`PAID: ${money(paid)}\nBALANCE: ${money(input.total-paid)}\nSTATUS: CREDIT`:status==="PARTIAL"?`DEPOSIT: ${money(paid)}\nBALANCE: ${money(input.total-paid)}\nSTATUS: ORDER`:`PAYMENT: ${input.method.toUpperCase()}\nSTATUS: PAID`,line,cfg.footer);if(cfg.showPoweredBy)rows.push("Powered by TheBarcode | Beyond Raw Data");return rows.join("\n");
}
