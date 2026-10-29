import { Fragment, useDeferredValue, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  listSilentPrinters,
  getPrinterQueue,
  clearPrinterQueue,
  printReceiptText,
  testReceiptText,
  defaultOrganizationSettings,
  defaultReceiptSettings,
  buildSaleReceipt,
  cachedOrganizationSettings,
  type OrganizationSettings,
  type ReceiptSettings,
} from "./receiptPrinter";
import { compareVersions, fetchLatestUpdate, GITHUB_UPDATE_MANIFEST } from "./updater";
import { APP_CHANNEL, APP_VERSION, RELEASE_NOTES } from "./version";
import { displayScales, saveDisplayScale, storedDisplayScale, type DisplayScaleName } from "./displayScale";
import { getSecurityActivity, recordSecurityActivity } from "./securityAudit";
import {
  bootstrap,
  bulkImportProducts,
  importHistoricalSales,
  getBackgroundJob,
  retryBackgroundJob,
  cancelBackgroundJob,
  createStaff,
  updateStaffPermissions,
  getAudit,
  getSystemLogs,
  getSystemHealth,
  getReadPerformance,
  getCustomerSummary,
  getProductionExpenses,
  createProductionExpense,
  payExpense,
  approveExpense,
  updateExpense,
  getInsights,
  getInsightsSettings,
  getMaintenanceBackups,
  createBackgroundBackup,
  purgeLiveData,
  getOperationalOverview,
  saveIndustryConfiguration,
  getModules,
  getRegistration,
  getRegistrationCatalog,
  saveRegistration,
  getRecipes,
  createRecipe,
  updateRecipe,
  getProductionRuns,
  createProductionRun,
  getProductImportBatches,
  getStaff,
  getSettings,
  getBills,
  getBillsPage,
  remindBill,
  updateBillFulfillment,
  getBillApprovals,
  payBill,
  updateBillPaymentMethod,
  postBill,
  cancelBill,
  refundBill,
  reverseProductImport,
  updateBill,
  requestBillApproval,
  resolveBillApproval,
  deleteProduct,
  updateCustomer,
  updateStaff,
  removeDemo,
  resetDemo,
  saveBranch,
  saveOrganization,
  saveReceiptConfiguration,
  saveTerminalConfiguration,
  saveInsightsSettings,
  syncOutbox,
  takeStockSyncError,
  getAccountingOverview,
  getAccountingTrialBalance,
  getAccountingJournals,
  getSuppliers,
  saveSupplier,
  deleteSupplier,
  getPurchaseOrders,
  savePurchaseOrder,
  sendPurchaseOrder,
  receivePurchaseOrder,
  getStocktakes,
  saveStocktake,
  submitStocktake,
  approveStocktake,
  getExpiringLots,
  recordWastage,
} from "./api";
const canAccess=(user:any,key:string)=>user?.role==="Owner"||user?.permissions?.includes(key)||((({Manager:["reports","approvals","accounting","audit","expenses","inventory"],Auditor:["reports","audit","accounting"],Storekeeper:["inventory"],Cashier:["sales","expenses"]} as Record<string,string[]>)[user?.role]||[]).includes(key));
import { categoryLabel, enabledModules, industryProfiles, productMeasure, profileFor } from "./industryProfiles";
import {
  db,
  queueCustomer,
  queueStockMovement,
  queueProduct,
  removeLocalDemo,
  purgeLocalLiveData,
  type Product,
} from "./db";
const money = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;
const ledgerText = (value: unknown) => {
  const n = Number(value);
  const currency = cachedOrganizationSettings().currency || "KES";
  return `${currency} ${Math.abs(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
function LedgerAmount({ value }: { value: unknown }) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return <span className="accounting-zero">—</span>;
  return <span className={n < 0 ? "accounting-negative" : "accounting-positive"}>{n < 0 ? `(${ledgerText(n)})` : ledgerText(n)}</span>;
}
type Props = {
  view: string;
  products: Product[];
  user: { id: string; name: string; role: string; isDemo?: boolean };
  notify: (x: string) => void;
  navigate: (x: string) => void;
};
export function Management({ view, products, user, notify, navigate }: Props) {
  if (view === "Dashboard") return <Dashboard products={products} navigate={navigate} />;
  if (view === "Bills") return <Bills products={products} user={user} notify={notify} />;
  if (view === "Orders") return <Bills products={products} user={user} notify={notify} ordersOnly />;
  if (view === "Inventory")
    return <Inventory products={products} user={user} notify={notify} />;
  if (view === "Customers") return <Customers notify={notify} />;
  if (view === "Expenses" || view === "Expense") return <Expenses user={user} notify={notify} />;
  if (view === "Production") return <Production products={products} user={user} notify={notify} />;
  if (view === "Purchasing") return <>{false&&<Purchasing products={products} notify={notify}/>}<PurchasingV2 products={products} notify={notify} /></>;
  if (view === "Stocktake") return <Stocktake products={products} user={user} notify={notify} />;
  if (view === "Accounting") return <Accounting user={user} />;
  if (view === "Reports") return <Reports user={user} />;
  if (view === "Smart Insights" || view === "Smart insights") return <SmartInsights user={user} />;
  if (view === "Audit" || view === "Audit trail") return <Audit user={user} />;
  if (view === "System logs") return <SystemLogsView user={user} />;
  if (["Staff", "Users & roles", "Staff & roles", "Staff & Roles"].includes(view))
    return <Staff user={user} notify={notify} />;
  if (view === "Item Setup" || view === "Item setup") return <ItemSetup products={products} user={user} notify={notify} />;
  return <Settings user={user} notify={notify} />;
}
function Dashboard({ products,navigate }: { products: Product[]; navigate:(x:string)=>void }) {
  const [overview, setOverview] = useState<any>(null);
  const dateInput=(value:Date)=>value.toISOString().slice(0,10);
  const [to,setTo]=useState(dateInput(new Date()));
  const [from,setFrom]=useState(()=>{const value=new Date();value.setDate(value.getDate()-6);return dateInput(value)});
  useEffect(() => {
    let busy=false;const load=()=>{if(busy||document.visibilityState!=="visible")return;busy=true;void getOperationalOverview(from,to).then(setOverview).catch(() => 0).finally(()=>{busy=false})};load();const changed=()=>load();const timer=setInterval(load,60000);addEventListener("thebarcode:data-changed",changed);addEventListener("focus",changed);return()=>{clearInterval(timer);removeEventListener("thebarcode:data-changed",changed);removeEventListener("focus",changed)};
  }, [from,to]);
  const daily = (overview?.daily ?? []).map((d:any)=>({day:new Date(d.date).toLocaleDateString("en",{weekday:"short"}),revenue:d.revenue,profit:d.profit}));
  const margin=overview?.revenue ? overview.grossProfit/overview.revenue*100 : 0;
  return (
    <Page>
      <div className="date-range" aria-label="Dashboard date range"><label>From <input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To <input type="date" value={to} min={from} max={dateInput(new Date())} onChange={e=>setTo(e.target.value)}/></label><span className="muted">Live data · latest range ends today by default</span></div>
      <Kpis onSelect={(label)=>{localStorage.setItem("bill_filter",label.includes("credit")?"Pending":label.includes("sales")?"All":"Held");navigate(label.includes("stock")?"Inventory":label.includes("credit")?"Bills":label.includes("sales")?"Bills":"Inventory")}}
        items={[
          ["Sales in range", money(overview?.revenue ?? 0), `${overview?.salesCount ?? 0} posted sales`],
          ["Gross profit", money(overview?.grossProfit ?? 0), `${margin.toFixed(1)}% margin`],
          ["Customer credit", money(overview?.customerDebt ?? 0), "Open customer balances"],
          [
            "Low stock",
            `${products.filter((x) => x.stock <= x.minStock).length} items`,
            "Needs action",
          ],
        ]}
      />
      <Two>
        <Panel title="Daily revenue & profit">
          <div className="chart-legend">
            <span className="revenue">Revenue</span>
            <span className="profit">Profit</span>
          </div>
          <Chart>
            <BarChart data={daily}>
              <CartesianGrid vertical={false} stroke="#e4ebe7" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar
                dataKey="revenue"
                stackId="daily"
                fill="#153d34"
                radius={[0, 0, 4, 4]}
              />
              <Bar
                dataKey="profit"
                stackId="daily"
                fill="#ff7542"
                radius={[5, 5, 0, 0]}
              >
                <LabelList
                  dataKey="profit"
                  position="top"
                  formatter={(v: any) => `${Math.round(v / 1000)}k`}
                />
              </Bar>
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Payment mix">
          <Donut
            data={(overview?.paymentMix ?? []).map((x:any)=>[x.name,x.amount])}
            colors={["#153d34", "#ff7542", "#efb45a"]}
            center={`${Number(overview?.collectionRate??0).toFixed(1)}%`}
            subtitle={`sales collected · ${money(overview?.cashCollected??0)} received in range`}
          />
        </Panel>
      </Two>
      <Two>
        <Panel title="Top sellers">
          <Table
            heads={["Item", "Qty", "Revenue"]}
            rows={(overview?.topSellers ?? []).slice(0,5).map((x:any)=>[x.name,String(x.quantity),money(x.revenue)])}
          />
        </Panel>
        <Panel title="Activity">
          <div className="activity">
            {(overview?.activity ?? []).slice(0,6).map((x:any) => (
              <p key={`${x.occurredAt}-${x.details}`}>
                <i />
                <span>
                  <b>{x.actor} · {x.action} {x.entityType}</b>
                  <small>{x.details} · {new Date(x.occurredAt).toLocaleString()}</small>
                </span>
              </p>
            ))}
          </div>
        </Panel>
      </Two>
    </Page>
  );
}
function OrderCalendar({rows,onOpen}:{rows:any[];onOpen:(row:any)=>void}){
  const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
  const firstDay=month.getDay();
  const daysInMonth=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const monthKey=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}`;
  const scheduled=rows.filter(row=>row.expectedDeliveryAt&&String(row.expectedDeliveryAt).slice(0,7)===monthKey);
  const byDay=scheduled.reduce<Record<string,any[]>>((map,row)=>{const day=String(row.expectedDeliveryAt).slice(0,10).slice(-2);(map[day]??=[]).push(row);return map},{});
  const cells=Array.from({length:firstDay+daysInMonth},(_,index)=>index<firstDay?null:index-firstDay+1);
  const move=(offset:number)=>setMonth(new Date(month.getFullYear(),month.getMonth()+offset,1));
  return <Panel title="Order calendar"><div className="order-calendar-head"><div><b>{month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</b><small>{scheduled.length} scheduled order{scheduled.length===1?"":"s"}</small></div><div className="button-row"><button className="secondary-button" onClick={()=>move(-1)} aria-label="Previous month">Previous</button><button className="secondary-button" onClick={()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1))}}>Today</button><button className="secondary-button" onClick={()=>move(1)} aria-label="Next month">Next</button></div></div><div className="order-calendar-grid" role="grid" aria-label="Order delivery calendar">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><span key={day} className="order-calendar-weekday" role="columnheader">{day}</span>)}{cells.map((day,index)=>{const dayRows=day?byDay[String(day).padStart(2,"0")]||[]:[];return <div key={`${monthKey}-${index}`} className={`order-calendar-cell${day?"":" is-empty"}`} role="gridcell">{day&&<><span className="order-calendar-date">{day}</span><div className="order-calendar-items">{dayRows.slice(0,3).map(row=>{const cleared=["Completed","Cancelled"].includes(String(row.fulfillmentStatus))||row.status==="Paid";return <button key={row.id} className={`order-calendar-item${cleared?" is-cleared":""}`} onClick={()=>onOpen(row)} title={`${cleared?"View cleared":"Open"} order #${row.receiptNumber}`}><b>#{row.receiptNumber}</b><span>{row.customerName||"Walk-in"}</span><small>{row.fulfillmentStatus||row.status}{cleared?" · cleared":""}</small></button>})}{dayRows.length>3&&<small className="order-calendar-more">+{dayRows.length-3} more</small>}</div></>}</div>})}</div>{rows.some(row=>!row.expectedDeliveryAt)&&<p className="order-calendar-note">{rows.filter(row=>!row.expectedDeliveryAt).length} order{rows.filter(row=>!row.expectedDeliveryAt).length===1?"":"s"} have no delivery date yet. Open the order to add one and keep it on the calendar.</p>}</Panel>
}

function Bills({products,user,notify,ordersOnly=false}:{products:Product[];user:{id:string;name:string;role:string};notify:(x:string)=>void;ordersOnly?:boolean}){
  const customers=useLiveQuery(()=>db.customers.toArray(),[])??[];
  const [status,setStatus]=useState(ordersOnly?"Pending":localStorage.getItem("bill_filter")||"Pending"),[rows,setRows]=useState<any[]>([]),[selected,setSelected]=useState<any>(),[lines,setLines]=useState<any[]>([]),[payment,setPayment]=useState({method:"Cash",amount:0,reference:""}),[addProductId,setAddProductId]=useState(""),[productSearch,setProductSearch]=useState(""),[pendingApproval,setPendingApproval]=useState(false),[creditOpen,setCreditOpen]=useState(false),[newCustomer,setNewCustomer]=useState({name:"",phone:"",creditLimit:0}),[approvals,setApprovals]=useState<any[]>([]);
  const [billTotal,setBillTotal]=useState(0),[loadingMore,setLoadingMore]=useState(false);
  const [billSearch,setBillSearch]=useState("");
  const canApprove=canAccess(user,"approvals");const canCorrectPayment=canApprove;const load=async()=>{try{const [loaded,approvalRows]=await Promise.all([ordersOnly?getBills("All"):getBillsPage(status,0,50,billSearch),canApprove?getBillApprovals():Promise.resolve([])]);const visible=ordersOnly?(loaded as any[]).filter(x=>x.status==="Held"||x.status==="PendingApproval"||x.status==="Credit"||x.status==="PartiallyPaid"||x.expectedDeliveryAt):loaded.rows;setRows(visible);setBillTotal(ordersOnly?visible.length:loaded.total);setApprovals(approvalRows as any[]);const focus=localStorage.getItem("bill_focus");if(focus){const match=visible.find((x:any)=>x.id===focus)||(await getBills("All")).find((x:any)=>x.id===focus);if(match)open(match);localStorage.removeItem("bill_focus")}}catch{setRows([])}};useEffect(()=>{localStorage.removeItem("bill_filter");const timer=setTimeout(()=>void load(),billSearch?250:0);return()=>clearTimeout(timer)},[status,canApprove,ordersOnly,billSearch]);
  const loadMore=async()=>{if(loadingMore||ordersOnly||rows.length>=billTotal)return;setLoadingMore(true);try{const page=await getBillsPage(status,rows.length,50,billSearch);setRows(current=>[...current,...page.rows]);setBillTotal(page.total)}catch(e){notify(e instanceof Error?e.message:"More bills could not be loaded")}finally{setLoadingMore(false)}};
  const open=(x:any)=>{setSelected(x);setPendingApproval(Boolean(x.revisions?.some((r:any)=>r.action==="ApprovalRequested")));setProductSearch("");setLines(x.items.map((i:any)=>({productId:i.productId,productName:i.productName,quantity:Number(i.quantity),unitPrice:Number(i.unitPrice),discount:Number(i.discount||0)})));setPayment({method:"Cash",amount:Number(x.balance||0),reference:""})};
  const revisionPayload=(customerId?:string)=>({customerId:customerId||selected.customerId,discount:selected.discount||0,notes:selected.notes,expectedDeliveryAt:selected.expectedDeliveryAt||undefined,assignedStaffId:selected.assignedStaffId||undefined,reason:"Held bill change requested from bill workspace",deviceId:localStorage.getItem("device_id"),expectedRevision:selected.revision,items:lines.map(x=>({productId:x.productId,quantity:x.quantity,unitPrice:x.unitPrice,discount:x.discount||0}))});
  const saveHeld=async()=>{const payload=revisionPayload();const lowers=lines.reduce((s,x)=>s+x.quantity*x.unitPrice-x.discount,0)<Number(selected.total);try{if(lowers&&!canApprove){await requestBillApproval(selected.id,payload);setSelected(undefined);notify(`Bill #${selected.receiptNumber} is now Pending Approval`);dispatchEvent(new Event("dukora:attention"));await load();return}const saved=await updateBill(selected.id,payload);setSelected(undefined);setPendingApproval(false);notify(`Bill #${saved.receiptNumber} revision ${saved.revision} saved across bills, stock checks and reports`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Owner or manager approval is required")}};
  const resolveApproval=async(item:any,approve:boolean)=>{const reason=prompt(`${approve?"Approve":"Reject"} change to bill #${item.receiptNumber}: reason`);if(!reason)return;try{await resolveBillApproval(item.id,{approve,reason,deviceId:localStorage.getItem("device_id")});notify(`Bill #${item.receiptNumber} change ${approve?"approved":"rejected"}`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Approval could not be completed")}};
  const post=async(kind:"Paid"|"Credit",customerId?:string,paidMethod:"Cash"|"M-Pesa"="Cash")=>{if(kind==="Credit"&&!customerId&&!selected.customerId){setCreditOpen(true);return}try{const revised=await updateBill(selected.id,{...revisionPayload(customerId),reason:"Final bill revision before posting"});const method=kind==="Paid"?paidMethod:"Credit";const posted=await postBill(revised.id,{status:kind,method,amountPaid:kind==="Paid"?revised.total:0,dueAt:kind==="Credit"?new Date(Date.now()+7*86400000).toISOString():undefined,notes:"Posted from bill workspace",deviceId:localStorage.getItem("device_id")});setCreditOpen(false);open({...posted,customerName:selected.customerName||revised.customerName,cashierName:selected.cashierName||revised.cashierName});notify(`${kind} bill posted via ${kind==="Paid"?method:"customer credit"}; choose Print ${kind} Bill below if a receipt is required`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Bill could not be posted")}};
  const addLine=()=>{const p=products.find(x=>x.id===addProductId);if(!p)return;setLines(current=>{const existing=current.find(x=>x.productId===p.id);if(existing&&existing.quantity>=p.stock){notify(`${p.name} is limited to ${p.stock} available units`);return current}return existing?current.map(x=>x.productId===p.id?{...x,quantity:Math.min(p.stock,x.quantity+1)}:x):[...current,{productId:p.id,productName:p.name,quantity:1,unitPrice:p.sellingPrice,discount:0}]});setAddProductId("")};
  const removeLine=(productId:string)=>{if(lines.length===1){notify("A held bill must retain at least one item; cancel the bill instead");return}setLines(current=>current.filter(x=>x.productId!==productId));notify(canApprove?"Item removed from the draft; save the revision to apply it":"Item marked for removal; save the revision to request approval")};
  const refreshSelected=async()=>{const current=(await getBills("All")).find((x:any)=>x.id===selected.id);if(!current){setSelected(undefined);return}open(current);notify(`Bill #${current.receiptNumber} refreshed to revision ${current.revision}`)};
  const chooseCreditCustomer=(customer:any)=>{setCreditOpen(false);void post("Credit",customer.id)};
  const createCreditCustomer=async(e:FormEvent)=>{e.preventDefault();const customer={id:crypto.randomUUID(),...newCustomer,notes:"Created while posting credit bill"};await queueCustomer(customer);await syncOutbox();chooseCreditCustomer(customer)};
  const recordPayment=async()=>{try{const saved=await payBill(selected.id,{...payment,deviceId:localStorage.getItem("device_id")});setSelected(undefined);notify(`Payment recorded; balance ${money(saved.balance)}`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Payment could not be recorded")}};
  const correctPayment=async(paymentId:string,method:string)=>{const reason=prompt("Reason for correcting this payment method");if(!reason)return;try{await updateBillPaymentMethod(selected.id,paymentId,method,reason);notify("Payment method corrected and audited");await refreshSelected();await load()}catch(e){notify(e instanceof Error?e.message:"Payment method could not be corrected")}};
  const cancel=async()=>{const reason=prompt("Owner/manager cancellation reason");if(!reason)return;try{await cancelBill(selected.id,reason,localStorage.getItem("device_id")||undefined);setSelected(undefined);notify("Held bill cancelled with audit record");dispatchEvent(new Event("dukora:attention"));await load()}catch{notify("Owner or manager authorization is required")}};
  const refund=async()=>{const reason=prompt("Owner/manager refund reason");if(!reason)return;try{await refundBill(selected.id,reason,localStorage.getItem("device_id")||undefined);setSelected(undefined);notify("Sale refunded; inventory and accounts reversed");dispatchEvent(new Event("dukora:attention"));await load()}catch{notify("Owner or manager authorization is required")}};
  const remind=async()=>{try{await remindBill(selected.id);notify(`Reminder recorded for order #${selected.receiptNumber}`);await refreshSelected();await load()}catch(e){notify(e instanceof Error?e.message:"Reminder could not be recorded")}};
  const updateFulfillment=async(status:string)=>{try{const saved=await updateBillFulfillment(selected.id,status);open({...selected,...saved});notify(`Order #${selected.receiptNumber} marked ${status.toLowerCase()}`);await load()}catch(e){notify(e instanceof Error?e.message:"Fulfillment status could not be updated")}};
  const print=async()=>{try{let bill=selected;if(selected.status==="Held")bill=await updateBill(selected.id,{...revisionPayload(),reason:"Revision saved before unpaid printing"});const credit=bill.status!=="Paid",receiptStatus=bill.status==="Held"||bill.status==="PendingApproval"?"UNPAID":bill.status==="Paid"?"PAID":bill.status==="PartiallyPaid"?"PARTIAL":"CREDIT";const text=buildSaleReceipt({id:String(bill.receiptNumber),customerName:bill.customerName||selected.customerName||"Walk-in customer",cashierName:bill.cashierName||selected.cashierName||user.name,method:bill.payments?.at(-1)?.method||"Unpaid",status:receiptStatus,credit,paid:Number(bill.paid||0),items:bill.items.filter((x:any)=>!x.isAddon).map((x:any)=>({name:x.productName,quantity:Number(x.quantity),unitPrice:Number(x.unitPrice)})),total:Number(bill.total)});await printReceiptText(bill.status==="Held"||bill.status==="PendingApproval"?`${text}\nREVISION: ${bill.revision}`:text);setSelected(undefined);notify(`Revision ${bill.revision} saved and ${receiptStatus} receipt sent to the configured printer`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Bill could not be validated and printed")}};
  const totals={held:rows.filter(x=>x.status==="Held").length,credit:rows.filter(x=>x.status==="Credit"||x.status==="PartiallyPaid").reduce((s,x)=>s+Number(x.balance),0),overdue:rows.filter(x=>x.dueAt&&new Date(x.dueAt)<new Date()&&x.balance>0).length};
  return <Page><Intro title={ordersOnly?"Orders":"Bills & payment follow-up"} text={ordersOnly?"Track deposits, balances, delivery dates and fulfillment without changing the fast sale screen.":"Open, revise, post and collect against the complete live bill register."}/>
    {ordersOnly&&<OrderCalendar rows={rows} onOpen={open}/>} 
    <Filter>{["All","Pending","PendingApproval","Held","Credit","PartiallyPaid","Paid","Cancelled"].map(x=><button className={status===x?"active":""} onClick={()=>setStatus(x)} key={x}>{x==="PendingApproval"?"Pending approval":x}</button>)}</Filter>
    <Kpis onSelect={label=>setStatus(label==="Held bills"?"Held":label==="Outstanding"?"Credit":label==="Overdue"?"Pending":"All")} items={[["Held bills",String(totals.held),"Editable unpaid orders"],["Outstanding",money(totals.credit),"Credit and partial balances"],["Overdue",String(totals.overdue),"Past due date"],["Visible bills",String(rows.length),`Filter: ${status}`]]}/>
    {canApprove&&approvals.length>0&&<Panel title={`Held-bill approvals (${approvals.length})`}><Table heads={["Bill","Requested by","Requested change","Reason","Time","Decision"]} rows={approvals.map(x=>[`#${x.receiptNumber}`,x.requestedBy,`${x.itemCount} items · ${money(x.currentTotal)} → ${money(x.requestedTotal)}`,x.reason,new Date(x.createdAt).toLocaleString(),<span key={`approval-${x.id}`} className="button-row"><button onClick={()=>resolveApproval(x,true)}>Approve</button><button className="danger-button" onClick={()=>resolveApproval(x,false)}>Reject</button></span>])}/></Panel>}
    {!ordersOnly&&<Filter><label>Search all bills <input type="search" value={billSearch} onChange={event=>setBillSearch(event.target.value)} placeholder="Receipt number, customer or status" aria-label="Search all bills"/></label><span>{rows.length} of {billTotal} matching bills loaded</span></Filter>}
    <Panel title={ordersOnly?"Order register":"Bill register"}><Table heads={ordersOnly?["Order","Date","Customer","Fulfillment","Delivery","Total","Paid","Balance","Action"]:["Bill","Date","Customer","Status","Total","Paid","Balance","Action"]} rowClasses={rows.map(x=>x.status==="Held"&&x.items?.some((item:any)=>{const product=products.find(p=>p.id===item.productId);return product&&product.stock<=product.minStock*1.5})?"held-stock-warning":"")} rows={rows.map(x=>{const lowStockItems=(x.items||[]).filter((item:any)=>{const product=products.find(p=>p.id===item.productId);return product&&product.stock<=product.minStock*1.5}).map((item:any)=>item.productName);const customerCell=<span className={lowStockItems.length?"held-stock-cell":""} title={lowStockItems.length?`Nearly out of stock: ${lowStockItems.join(", ")}`:undefined}>{x.customerName|| (ordersOnly?"Unregistered":"Walk-in")}{lowStockItems.length?` · Low stock: ${lowStockItems.join(", ")}`:""}</span>;return ordersOnly?[`#${x.receiptNumber} · r${x.revision}`,new Date(x.occurredAt).toLocaleString(),customerCell,<span key={`status-${x.id}`} className={`badge ${String(x.status).toLowerCase()}`}>{x.fulfillmentStatus||x.status}</span>,x.expectedDeliveryAt?new Date(x.expectedDeliveryAt).toLocaleDateString():"Immediate",money(x.total),money(x.paid),money(x.balance),<button key={`open-${x.id}`} className="table-action" onClick={()=>open(x)}>Open</button>]:[`#${x.receiptNumber} · r${x.revision}`,new Date(x.occurredAt).toLocaleString(),customerCell,<span key={`status-${x.id}`} className={`badge ${String(x.status).toLowerCase()}`}>{x.status}</span>,money(x.total),money(x.paid),money(x.balance),<button key={`open-${x.id}`} className="table-action" onClick={()=>open(x)}>Open</button>]})}/></Panel>
    {!ordersOnly&&rows.length<billTotal&&<div className="grid-pagination"><span>{rows.length} of {billTotal} bills loaded</span><button type="button" className="secondary-button" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?"Loading…":"Load 50 more bills"}</button></div>}
    {selected&&<div className="modal bill-workspace"><section><button className="close" aria-label="Close bill" onClick={()=>setSelected(undefined)}>×</button><div className="bill-workspace-header"><span><small>Bill workspace</small><h2>Bill #{selected.receiptNumber}</h2></span><span className={`badge ${String(selected.status).toLowerCase()}`}>{selected.status}</span><p>Revision {selected.revision} · {selected.customerName||"Walk-in customer"}</p></div>
      {ordersOnly&&<div className="order-fulfillment-controls"><Field label="Fulfillment status"><select value={selected.fulfillmentStatus||"Immediate"} onChange={e=>void updateFulfillment(e.target.value)}><option>Immediate</option><option>Scheduled</option><option>Preparing</option><option>Ready</option><option>Completed</option><option>Cancelled</option></select></Field><span className="order-fulfillment-note">Use the status to keep production, pickup and delivery teams aligned. Changes are audited.</span></div>}
      {selected.status==="Held"&&<div className="payment-box bill-product-picker"><h3>Add another item to this held bill</h3><Field label="Search products"><input value={productSearch} placeholder="Name, category, barcode or SKU" onChange={e=>setProductSearch(e.target.value)}/></Field><Field label="Matching item"><SearchableSelect value={addProductId} onChange={setAddProductId} options={products.filter(x=>x.active&&x.sellable&&(!productSearch||`${x.name} ${x.category} ${x.barcode||""}`.toLowerCase().includes(productSearch.toLowerCase()))).map(x=>({value:x.id,label:`${x.name} · ${x.packageQuantity||1} ${x.packageUnit||x.unit}${x.stock<=0?" · OUT OF STOCK":""}`}))} ariaLabel="Search products to add" /></Field><button disabled={!addProductId||Number(products.find(x=>x.id===addProductId)?.stock??0)<=0} onClick={addLine}>＋ Add item</button></div>}
      {(pendingApproval||selected.status==="PendingApproval")&&<div className="approval-notice"><b>Reduction awaiting approval</b><span>The saved bill remains unchanged until an Owner or Manager approves or rejects it.</span><button onClick={refreshSelected}>Refresh status</button></div>}
      <div className="bill-edit-lines">{lines.map((x,i)=><div key={x.productId}>{selected.status==="Held"?<button disabled={pendingApproval} className="remove-bill-line" title={`Remove ${x.productName}`} onClick={()=>removeLine(x.productId)}>×</button>:<span className="remove-bill-line-spacer" aria-hidden="true"/>}<b>{x.productName}</b><Field label="Quantity"><input type="number" min="1" max={products.find(p=>p.id===x.productId)?.stock||x.quantity} step="1" disabled={selected.status!=="Held"||pendingApproval} value={x.quantity} onChange={e=>{const max=Number(products.find(p=>p.id===x.productId)?.stock||1),requested=Math.max(1,Math.trunc(+e.target.value||1));if(requested>max)notify(`${x.productName} is limited to ${max} available units`);setLines(lines.map((v,j)=>j===i?{...v,quantity:Math.min(max,requested)}:v))}}/></Field><Field label="Price"><input type="number" min="0" step="0.01" disabled={selected.status!=="Held"||pendingApproval} value={x.unitPrice} onChange={e=>setLines(lines.map((v,j)=>j===i?{...v,unitPrice:+e.target.value}:v))}/></Field><strong>{money(x.quantity*x.unitPrice)}</strong></div>)}</div>
      <div className="button-row bill-workspace-actions">{selected.status==="Held"&&<><button className="secondary-button" disabled={pendingApproval} onClick={saveHeld}>Save revision</button><button disabled={pendingApproval} onClick={()=>post("Paid",undefined,"Cash")}>Post as Paid · Cash</button><button disabled={pendingApproval} onClick={()=>post("Paid",undefined,"M-Pesa")}>Post as Paid · M-Pesa</button><button className="secondary-button" disabled={pendingApproval} onClick={()=>post("Credit")}>Post as Credit</button><button className="danger-button" onClick={cancel}>Cancel</button></>}{ordersOnly&&<button className="secondary-button" onClick={remind}>Remind assignee</button>}{["Paid","Credit","PartiallyPaid"].includes(selected.status)&&canApprove&&<button className="danger-button" onClick={refund}>Refund / reverse</button>}<button className="secondary-button" onClick={print}>Print {selected.status==="Held"?"Unpaid":selected.status==="Paid"?"Paid":selected.status==="PartiallyPaid"?"Order":"Credit"} {selected.status==="PartiallyPaid"?"receipt":"Bill"}</button></div>
      {(selected.status==="Credit"||selected.status==="PartiallyPaid")&&<section className="payment-box later-payment"><div className="later-payment-header"><span><small>Outstanding balance</small><h3>Record later payment</h3></span><strong>{money(selected.balance)}</strong></div><Field label="Method"><select value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Bank</option></select></Field><Field label="Amount"><input type="number" min=".01" max={selected.balance} step=".01" value={payment.amount} onChange={e=>setPayment({...payment,amount:+e.target.value})}/></Field><Field label="Reference"><input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></Field><button className="primary-button" onClick={recordPayment}>Record payment</button></section>}
       {canCorrectPayment&&Array.isArray(selected.payments)&&selected.payments.length>0&&<Panel title="Recorded payments"><Table heads={["Date","Method","Amount","Correction"]} rows={selected.payments.map((p:any)=>([new Date(p.paidAt||p.createdAt).toLocaleString(),p.method,money(p.amount),<select key={`payment-${p.id}`} defaultValue={p.method} onChange={e=>void correctPayment(p.id,e.target.value)}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Bank</option></select>]))}/></Panel>}
       <div className="bill-history"><Panel title="Immutable revision history"><Table heads={["Revision","Action","Reason","Time"]} rows={(selected.revisions||[]).map((x:any)=>[String(x.revision),x.action,x.reason,new Date(x.createdAt).toLocaleString()])}/></Panel></div>
    </section></div>}
    {creditOpen&&<div className="modal customer-modal"><section><button className="close" onClick={()=>setCreditOpen(false)}>×</button><h2>Customer required for credit</h2><p className="muted">Select an existing customer or register their details before posting this bill as credit.</p><div className="customer-list">{customers.filter(x=>x.name!=="Walk-in").map(x=><button key={x.id} onClick={()=>chooseCreditCustomer(x)}><i>{x.name[0]}</i><span><b>{x.name}</b><small>{x.phone||"No phone"} · Limit {money(x.creditLimit)}</small></span></button>)}</div><form className="customer-form" onSubmit={createCreditCustomer}><Field label="New customer name"><input required value={newCustomer.name} onChange={e=>setNewCustomer({...newCustomer,name:e.target.value})}/></Field><Field label="Phone"><input value={newCustomer.phone} onChange={e=>setNewCustomer({...newCustomer,phone:e.target.value})}/></Field><Field label="Credit limit"><input type="number" min="0" step="0.01" value={newCustomer.creditLimit} onChange={e=>setNewCustomer({...newCustomer,creditLimit:+e.target.value})}/></Field><button>Register and Post as Credit</button></form></section></div>}
  </Page>
}
function Inventory({
  products,
  user,
  notify,
}: {
  products: Product[];
  user: Props["user"];
  notify: (x: string) => void;
}) {
  const canMove=canAccess(user,"inventory");
  const [open, setOpen] = useState(false),
    [savingMovement,setSavingMovement]=useState(false),
    [riskOpen,setRiskOpen]=useState(false),
    [overview,setOverview]=useState<any>(null),
    [form, setForm] = useState({
      productId: products[0]?.id ?? "",
      type: "Restock",
      adjustmentDirection: "Increase",
      quantity: 1,
      notes: "",
      affectsFinancials: true,
      unitCost: Number(products[0]?.costPrice ?? 0),
      payee: "",
      reference: "",
    });
  useEffect(() => {
    if (!form.productId && products[0])
      setForm((x) => ({ ...x, productId: products[0].id,unitCost:Number(products[0].costPrice??0) }));
  }, [products, form.productId]);
  useEffect(()=>{const end=new Date(),start=new Date();start.setDate(start.getDate()-29);getOperationalOverview(start.toISOString().slice(0,10),end.toISOString().slice(0,10)).then(setOverview).catch(()=>setOverview(null))},[products]);
  const pendingStock=useLiveQuery(()=>db.outbox.filter(x=>x.type==='stock'||x.type==='product-create').toArray(),[])?.filter(x=>Boolean(x.payload?.isDemo)===Boolean(user.isDemo))??[];
  const stockRisks:any[]=overview?.lowStock??products.filter(x=>x.stock<=x.minStock*1.5).map(x=>({...x,belowMinimum:x.stock<=x.minStock,daysRemaining:null,dailyUse:0}));
  const chart = Object.values(products.reduce((a:any,x)=>{a[x.category]??={name:x.category,value:0};a[x.category].value+=x.stock*x.costPrice;return a},{})).map((x:any)=>({...x,label:money(x.value)}));
  async function save(e: FormEvent) {
    e.preventDefault();
    if(savingMovement)return;
    const product=products.find(x=>x.id===form.productId);
    if(!product){notify("Choose an item before recording stock.");return;}
    if(!Number.isFinite(form.quantity)||form.quantity<=0){notify("Enter a positive quantity.");return;}
    if(product.trackingMode==="Discrete"&&!Number.isInteger(form.quantity)){notify(`${product.name} uses whole stock units.`);return;}
    const sign=form.type==="Restock"||(form.type==="Adjustment"&&form.adjustmentDirection==="Increase")?1:-1;
    if(sign<0&&form.quantity>product.stock){notify(`${product.name} shows ${product.stock} available locally; decrease cannot exceed this amount.`);return;}
    if(form.type==="Restock"&&form.affectsFinancials&&(!Number.isFinite(form.unitCost)||form.unitCost<=0)){notify("Enter a positive unit cost for a financially tracked restock.");return;}
    const movementId=crypto.randomUUID();
    setSavingMovement(true);
    try{
    await queueStockMovement({
      movementId,
      productId: form.productId,
      staffId: user.id,
      type: form.type,
      quantityChange: form.quantity * sign,
      notes: form.notes,
      deviceId: "windows-pos-01",
      affectsFinancials: form.type==="Restock"&&form.affectsFinancials,
      unitCost: form.type==="Restock"?form.unitCost:undefined,
      payee: form.payee || undefined,
      reference: form.reference || undefined,
    });
    await syncOutbox();
    let pending=await db.outbox.filter(x=>x.type==='stock'&&x.payload?.movementId===movementId).first();
    if(pending&&!pending.lastAttemptAt){await syncOutbox();pending=await db.outbox.filter(x=>x.type==='stock'&&x.payload?.movementId===movementId).first();}
    const rejected=takeStockSyncError(movementId);
    if(rejected){notify(`Stock was not changed: ${rejected}`);return;}
    if(!pending)await bootstrap().catch(()=>0);
    dispatchEvent(new Event("dukora:attention"));
    setOpen(false);
    notify(pending?`Stock saved on this device; waiting for the local server${pending.lastError?`: ${pending.lastError}`:"."}`:"Stock movement recorded and inventory refreshed.");
    }catch(error){notify(error instanceof Error?error.message:"Stock movement could not be saved.");}
    finally{setSavingMovement(false);}
  }
  return (
    <Page>
      <Intro
        title="Stock overview"
        text="Bar, café, kitchen and food stock with pending updates included."
        action={canMove?"＋ Stock movement":undefined}
        onAction={canMove?() => {setForm(current=>({...current,unitCost:Number(products.find(x=>x.id===current.productId)?.costPrice??0)}));setOpen(true)}:undefined}
      />
      {!canMove&&<p className="muted access-hint">Stock movements require Owner, Manager or Storekeeper access. Ask an authorized user to record the adjustment.</p>}
      {pendingStock.length>0&&<Panel title={`${pendingStock.length} stock update${pendingStock.length===1?"":"s"} waiting for the local server`}><p className="muted">These quantities are visible on this device but are not yet confirmed in the local SQLite database. They may not be available when holding a bill.</p>{pendingStock.map(row=>{const itemId=row.type==='stock'?row.payload.productId:row.payload.id,change=Number(row.type==='stock'?row.payload.quantityChange:row.payload.stock||0);return <p key={row.id}><b>{products.find(x=>x.id===itemId)?.name??"Item"}</b> · {change>0?"+":""}{change} · {row.lastError||"Waiting to retry"}</p>})}</Panel>}
      {open && (
        <div className="modal">
          <section>
            <button className="close" onClick={() => setOpen(false)}>
              ×
            </button>
            <h2>Stock movement</h2>
            <form className="customer-form" onSubmit={save}>
              <label>
                Item
                <SearchableSelect value={form.productId} onChange={productId=>{const selected=products.find(x=>x.id===productId);setForm({ ...form, productId,unitCost:Number(selected?.costPrice??0),quantity:selected?.trackingMode==="Discrete"?Math.max(1,Math.ceil(Number(form.quantity)||1)):form.quantity })}} options={products.map(x=>({value:x.id,label:`${x.name} · ${x.stock} available`}))} ariaLabel="Search stock items" />
              </label>
              <label>
                Movement
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option>Restock</option>
                  <option>Adjustment</option>
                  <option>Wastage</option>
                  <option>Transfer out</option>
                </select>
              </label>
              {form.type==="Adjustment"&&<><label>Direction<select value={form.adjustmentDirection} onChange={e=>setForm({...form,adjustmentDirection:e.target.value})}><option>Increase</option><option>Decrease</option></select></label><p className="muted">Adjustments correct counts without creating a purchase payable. Use Restock for purchased goods.</p></>}
              <label title="For restocks, the quantity received. Discrete items use whole units; measured items can use a decimal measure such as 0.5 kg.">
                Quantity
                <input
                  type="number"
                  min={products.find(x=>x.id===form.productId)?.trackingMode==="Discrete"?"1":"0.01"}
                  step={products.find(x=>x.id===form.productId)?.trackingMode==="Discrete"?"1":"0.01"}
                  required
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: +e.target.value })
                  }
                />
              </label>
              {form.type === "Restock" && <>
              <label title="The supplier cost per stock unit. This defaults to the item's cost price and creates a pending inventory payable when financials are enabled.">
                Unit cost
                <input type="number" min="0" step="0.01" value={form.unitCost} onChange={e=>setForm({...form,unitCost:Math.max(0,+e.target.value)})}/>
              </label>
              <label><input type="checkbox" checked={form.affectsFinancials} onChange={e=>setForm({...form,affectsFinancials:e.target.checked})}/> Affect financials (creates a pending inventory payable)</label>
              <div className="button-row"><label title="Optional supplier or branch name for the pending payable">Payee<input value={form.payee} onChange={e=>setForm({...form,payee:e.target.value})}/></label><label title="Optional invoice, delivery note or transfer reference">Reference<input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></label></div>
              </>}
              <label>
                Reason / notes
                <input
                  required
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <button disabled={savingMovement}>{savingMovement?"Saving…":"Save movement"}</button>
            </form>
          </section>
        </div>
      )}
      {riskOpen&&<div className="modal"><section><button className="close" onClick={()=>setRiskOpen(false)}>×</button><h2>Low & projected stock</h2><p className="muted">Projection uses the last 30 days of posted sales and highlights items likely to run low within seven days.</p><Table heads={["Item","Category","Stock","Minimum","Daily use","Days left","Action"]} rows={stockRisks.map(x=>[x.name,x.category,String(x.stock),String(x.minStock),Number(x.dailyUse||0).toFixed(1),x.daysRemaining==null?"No recent sales":Number(x.daysRemaining).toFixed(1),x.belowMinimum?"Restock now":"Plan restock"])}/></section></div>}
      <Kpis
        onSelect={(label)=>{if(label==="Low / projected")setRiskOpen(true)}}
        items={[
          [
            "Stock value",
            money(products.reduce((s, x) => s + x.stock * x.costPrice, 0)),
            "At cost",
          ],
          [
            "Low / projected",
            `${stockRisks.length} items`,
            "Click for restock list",
          ],
          ["Food & café items", `${products.length} SKUs`, "Kitchen included"],
        ]}
      />
      <Two>
        <Panel title="Stock value by category">
          <Chart>
            <BarChart
              data={chart}
              layout="vertical"
              margin={{ left: 8, right: 82 }}
            >
              <CartesianGrid horizontal={false} stroke="#e4ebe7" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={76}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={(v: any) => money(Number(v))} />
              <Bar
                dataKey="value"
                fill="#278463"
                radius={[0, 6, 6, 0]}
                barSize={22}
              >
                <LabelList
                  dataKey="label"
                  position="right"
                  fill="#405049"
                  fontSize={10}
                />
              </Bar>
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Stock health">
          <Donut
            data={[
              ["Healthy", products.filter((x) => x.stock > x.minStock).length],
              [
                "Watch",
                products.filter(
                  (x) => x.stock > x.minStock && x.stock <= x.minStock * 1.5,
                ).length,
              ],
              ["Low", stockRisks.length],
            ]}
            colors={["#25815f", "#efb45a", "#d7674e"]}
            center={`${Math.round((products.filter((x) => x.stock > x.minStock).length / Math.max(products.length, 1)) * 100)}%`}
            subtitle="healthy stock"
          />
        </Panel>
      </Two>
      <Panel title="All inventory">
        <Table
          heads={[
            "Item",
            "Category",
            "In stock",
            "Min.",
            "Cost",
            "Sell price",
            "Status",
          ]}
          rows={products.map((x) => [
            x.name,
            x.category,
            pendingStock.some(row=>(row.type==='stock'?row.payload?.productId:row.payload?.id)===x.id)?`${x.stock} local · awaiting confirmation`:String(x.stock),
            String(x.minStock),
            money(x.costPrice),
            money(x.sellingPrice),
            pendingStock.some(row=>(row.type==='stock'?row.payload?.productId:row.payload?.id)===x.id)?"Stock update pending":stockRisks.some(r=>r.id===x.id) ? (x.stock<=x.minStock?"Low":"Projected low") : "Healthy",
          ])}
        />
      </Panel>
    </Page>
  );
}
function Customers({notify}:{notify:(x:string)=>void}) {
  const stored = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? [];
  const [remote, setRemote] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({ name: "", phone: "", creditLimit: 0 }),[editing,setEditing]=useState<any>();
  useEffect(() => {
    getCustomerSummary()
      .then(setRemote)
      .catch(() => 0);
  }, []);
  const computed = stored
    .filter((x) => x.name !== "Walk-in")
    .map((c) => {
      const own = sales.filter((s) => s.customerId === c.id),
        spent = own.reduce((s, x) => s + x.total, 0),
        debt = own
          .filter((x) => x.status === "Credit")
          .reduce((s, x) => s + x.total, 0);
      return {
        name: c.name,
        phone: c.phone,
        totalSpent: spent,
        debt,
        lastVisit: own.length
          ? own
              .map((x) => x.occurredAt)
              .sort()
              .at(-1)
          : undefined,
      };
    });
  const ranked = (remote.length ? remote : computed).sort(
    (a, b) => b.totalSpent - a.totalSpent,
  );
  const debtTotal = ranked.reduce((s, x) => s + Number(x.debt || 0), 0);
  async function save(e: FormEvent) {
    e.preventDefault();
    await queueCustomer({
      id: crypto.randomUUID(),
      ...form,
      notes: "Registered from customer directory",
    });
    syncOutbox().catch(() => 0);
    setOpen(false);
    setForm({name:"",phone:"",creditLimit:0});
    notify("Customer created successfully");
  }
  async function saveEdit(e:FormEvent){e.preventDefault();try{await updateCustomer(editing.id,{name:editing.name,phone:editing.phone,creditLimit:editing.creditLimit,notes:editing.notes,active:editing.active!==false,reason:editing.reason});setEditing(undefined);setRemote(await getCustomerSummary());notify("Customer changes saved and audited")}catch(e){notify(e instanceof Error?e.message:"Customer changes could not be saved")}}
  return (
    <Page>
      <Intro
        title="Customers & credit"
        text="Ranked by lifetime spend, with outstanding debt included for follow-up."
        action="＋ Add customer"
        onAction={() => setOpen(true)}
      />
      {open && (
        <div className="modal">
          <section>
            <button className="close" onClick={() => setOpen(false)}>
              ×
            </button>
            <h2>Register customer</h2>
            <form className="customer-form" onSubmit={save}>
              <label>
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Credit limit
                <input
                  type="number"
                  value={form.creditLimit}
                min="0"
                step="0.01"
                  onChange={(e) =>
                    setForm({ ...form, creditLimit: +e.target.value })
                  }
                />
              </label>
              <button>Save customer</button>
            </form>
          </section>
        </div>
      )}
      <Kpis
        items={[
          ["Active customers", String(ranked.length), "Ordered by money spent"],
          [
            "Outstanding credit",
            money(debtTotal),
            `${ranked.filter((x) => x.debt > 0).length} customers with debt`,
          ],
          [
            "Lifetime customer spend",
            money(ranked.reduce((s, x) => s + Number(x.totalSpent || 0), 0)),
            "Paid and credit sales",
          ],
        ]}
      />
      <div className="risk-key">
        <span className="debt">Debt</span>
        <span className="watch">Watch</span>
        <span className="clear">Clear</span>
      </div>
      <Panel title="Customer directory"><Table heads={["Customer","Phone","Money spent","Debt","Last visit","Risk","Action"]} rowClasses={ranked.map(x=>x.debt>0?"row-debt":"")} rows={ranked.map(x=>[x.name,x.phone||"—",money(x.totalSpent),money(x.debt),x.lastVisit?new Date(x.lastVisit).toLocaleDateString():"—",<span key={`risk-${x.id||x.name}`} className={`badge ${x.debt>0?"debt":"clear"}`}>{x.debt>0?"Debt":"Clear"}</span>,<button key={`edit-${x.id||x.name}`} className="table-action" onClick={()=>setEditing({...x,active:x.active!==false,reason:""})}>Edit</button>])}/></Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit customer</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Phone"><input value={editing.phone||""} onChange={e=>setEditing({...editing,phone:e.target.value})}/></Field><Field label="Credit limit"><input type="number" min="0" step="0.01" value={editing.creditLimit} onChange={e=>setEditing({...editing,creditLimit:+e.target.value})}/></Field><Field label="Notes"><input value={editing.notes||""} onChange={e=>setEditing({...editing,notes:e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label><button>Save controlled change</button></form></section></div>}
    </Page>
  );
}
function Production({products,user,notify}:{products:Product[];user:{role:string};notify:(x:string)=>void}) {
  const industry=profileFor(cachedOrganizationSettings().industryProfile);
  const [modules,setModules]=useState<any>();const [recipes,setRecipes]=useState<any[]>([]),[runs,setRuns]=useState<any[]>([]),[adding,setAdding]=useState(false),[running,setRunning]=useState<any>(),[editingRecipe,setEditingRecipe]=useState<any>();
  const [form,setForm]=useState<any>({productId:"",name:"",yieldQuantity:1,notes:"",ingredients:[{productId:"",quantity:1,wastePercent:0}]});const [run,setRun]=useState({quantity:1,notes:""});
  const load=async()=>{try{const [m,r,p]=await Promise.all([getModules(),getRecipes(),getProductionRuns()]);setModules(m);setRecipes(r);setRuns(p)}catch(error){setModules((current:any)=>current||{mode:"Offline",package:"Server unavailable"});throw error}};useEffect(()=>{void load().catch(()=>0);const changed=(event:Event)=>{const path=(event as CustomEvent<any>).detail?.path||"";if(!path||path.includes("products")||path.includes("recipes")||path.includes("production")||path.includes("stock"))void load().catch(()=>0)};addEventListener("thebarcode:data-changed",changed);return()=>removeEventListener("thebarcode:data-changed",changed)},[products]);
  const canManage=canAccess(user,"inventory");const active=products.filter(x=>x.active);const outputs=active.filter(x=>(x.itemType||"Product")==="Product");const ingredients=active.filter(x=>(x.itemType||"Product")==="Ingredient");
  function updateIngredient(index:number,key:string,value:any){setForm({...form,ingredients:form.ingredients.map((x:any,i:number)=>i===index?{...x,[key]:value}:x)})}
  async function saveRecipe(e:FormEvent){e.preventDefault();try{const payload={productId:form.productId,name:form.name,yieldQuantity:+form.yieldQuantity,notes:form.notes,ingredients:form.ingredients.map((x:any)=>({productId:x.productId,quantity:+x.quantity,wastePercent:+x.wastePercent}))};if(editingRecipe)await updateRecipe(editingRecipe.id,{...payload,reason:"Recipe definition updated from production",active:true});else await createRecipe(payload);setAdding(false);setEditingRecipe(undefined);setForm({productId:"",name:"",yieldQuantity:1,notes:"",ingredients:[{productId:"",quantity:1,wastePercent:0}]});await load();notify(editingRecipe?"Recipe revision saved and previous version retained":"Recipe saved as a controlled new version")}catch(e){notify(e instanceof Error?e.message:"Recipe could not be saved")}}
  const editRecipe=(recipe:any)=>{setEditingRecipe(recipe);setForm({productId:recipe.productId,name:recipe.name,yieldQuantity:Number(recipe.yieldQuantity),notes:recipe.notes||"",ingredients:(recipe.ingredients||[]).map((x:any)=>({productId:x.ingredientProductId||x.productId,quantity:Number(x.quantity),wastePercent:Number(x.wastePercent||0)}))||[{productId:"",quantity:1,wastePercent:0}]});setAdding(true)};
  const deactivateRecipe=async(recipe:any)=>{if(!confirm(`Archive recipe “${recipe.name}” v${recipe.version}? Existing production history will remain.`))return;try{await updateRecipe(recipe.id,{productId:recipe.productId,name:recipe.name,yieldQuantity:Number(recipe.yieldQuantity),notes:recipe.notes||null,reason:"Recipe archived from production",ingredients:[],active:false});await load();notify("Recipe archived; production history was retained")}catch(e){notify(e instanceof Error?e.message:"Recipe could not be archived")}};
  async function completeRun(e:FormEvent){e.preventDefault();try{const result=await createProductionRun({recipeId:running.id,quantity:+run.quantity,notes:run.notes,deviceId:localStorage.getItem("device_id")||"production-ui"});setRunning(undefined);setRun({quantity:1,notes:""});await bootstrap();await load();dispatchEvent(new Event("thebarcode:data-changed"));dispatchEvent(new Event("dukora:attention"));notify(`Production completed · ${result.quantityProduced} units · ${money(result.totalCost)} cost`)}catch(e){notify(e instanceof Error?e.message:"Production run could not be completed")}}
  return <Page><Intro title={industry.productionLabel} text={`${industry.productionHelp} Every transaction updates ${industry.inputLabel.toLowerCase()}, output stock, costing and audit history.`}/>
    <Kpis items={[["Active recipes",String(recipes.filter(x=>x.active).length),"Version controlled"],["Completed runs",String(runs.length),"Latest 250"],["Production cost",money(runs.reduce((n,x)=>n+Number(x.totalCost),0)),"Recorded material cost"],["Access mode",modules?.mode||"Loading",modules?.package||"All features"]]}/>
    <div className="button-row">{canManage&&<button onClick={()=>{setEditingRecipe(undefined);setForm({productId:"",name:"",yieldQuantity:1,notes:"",ingredients:[{productId:"",quantity:1,wastePercent:0}]});setAdding(true)}}>+ New recipe</button>}<small className="muted">All completed modules are visible during Open Preview testing. Destructive and approval permissions remain role-controlled.</small></div>
    <Panel title={`Active ${industry.productionLabel.toLowerCase()} definitions`}><Table heads={["Output","Definition","Yield",industry.inputLabel,"Material cost","Version","Action"]} rows={recipes.filter(x=>x.active).map(x=>{const transactionNeeded=!runs.some((run:any)=>run.recipeId===x.id);return [x.productName,x.name,x.yieldQuantity,x.ingredients.map((i:any)=>`${i.quantity} ${i.unit||"unit"} ${i.productName}${i.wastePercent?` + ${i.wastePercent}%`:""}`).join(" · "),<span><b>{money(x.costPerYield)}</b><small className="muted"> · {money(x.costPerUnit??(Number(x.yieldQuantity)?Number(x.costPerYield)/Number(x.yieldQuantity):0))} / unit</small></span>,`v${x.version}`,canManage?<span className="button-row" key={`actions-${x.id}`}><button className="table-action" onClick={()=>editRecipe(x)}>Edit</button><button className={`table-action ${transactionNeeded?"attention-action":""}`} title={transactionNeeded?"Record the first production transaction to consume ingredients and add finished stock":"Record another production transaction when stock is ready"} onClick={()=>setRunning(x)}>Record transaction</button><button className="table-action" onClick={()=>void deactivateRecipe(x)}>Archive</button></span>:"View only"]})}/>{!recipes.some(x=>x.active)&&<p className="muted">No definition yet. Create the required {industry.inputLabel.toLowerCase()} and output item in Item Setup, then define their relationship here.</p>}</Panel>
    <Panel title="Production history"><Table heads={["Completed","Output","Quantity","Material cost","Status","Notes"]} rows={runs.map(x=>[new Date(x.occurredAt).toLocaleString(),x.productName,String(x.quantityProduced),money(x.totalCost),x.status,x.notes||"—"])} renderDetails={(_,index)=>{const run=runs[index];const ingredients=Array.isArray(run.ingredients)?run.ingredients:[];return <div className="production-breakdown"><b>Cost breakdown · {run.productName}</b>{ingredients.length?<div className="production-breakdown-grid">{ingredients.map((item:any)=><div key={`${run.id}-${item.ingredientProductId}`}><span>{item.ingredientName}</span><small>{Number(item.quantity).toFixed(3)} {item.unit} × {money(item.unitCost)}</small><strong>{money(item.totalCost)}</strong></div>)}</div>:<small className="muted">No ingredient snapshot is available for this older run.</small>}<small className="muted">Unit cost: {money(run.unitCost??(Number(run.quantityProduced)?Number(run.totalCost)/Number(run.quantityProduced):0))} · Batch cost: {money(run.totalCost)}</small></div>}}/></Panel>
    {adding&&<div className="modal record-editor"><section><button className="close" onClick={()=>{setAdding(false);setEditingRecipe(undefined)}}>×</button><h2>{editingRecipe?"Edit recipe revision":"New controlled definition"}</h2><form className="item-form" onSubmit={saveRecipe}><Field label="Output item" help="The finished Product added to stock when a production run is recorded. Ingredients cannot be selected here."><select required value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})}><option value="">Choose output item</option>{outputs.map(x=><option key={x.id} value={x.id}>{x.name} · {x.unit}</option>)}</select></Field><Field label="Definition name" help="A clear name for this recipe version, such as White Forest Cake · 1 kg."><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Output yield" help="How many finished units one batch creates. Example: 1 means this recipe makes one cake; 12 means it makes twelve portions."><input required type="number" min=".001" step=".001" value={form.yieldQuantity} onChange={e=>setForm({...form,yieldQuantity:+e.target.value})}/></Field>{form.ingredients.map((row:any,index:number)=><div className="recipe-line" key={index}><Field label={`${industry.inputLabel} ${index+1}`} help="Choose an item classified as Ingredient. Product items are deliberately excluded from recipe inputs."><select required value={row.productId} onChange={e=>updateIngredient(index,"productId",e.target.value)}><option value="">Choose {industry.inputLabel.toLowerCase()}</option>{ingredients.filter(x=>x.id!==form.productId).map(x=><option key={x.id} value={x.id}>{x.name} · {x.stock} {x.unit}</option>)}</select></Field><Field label="Quantity per yield" help="The amount consumed for one finished yield, using the ingredient's stock unit. Example: 0.5 kg flour or 500 ml milk for one cake."><input required type="number" min=".001" step=".001" value={row.quantity} onChange={e=>updateIngredient(index,"quantity",+e.target.value)}/></Field><Field label="Waste %" help="Expected process loss added to ingredient consumption. Enter 0 when there is no trimming, spillage or spoilage."><input type="number" min="0" step=".01" value={row.wastePercent} onChange={e=>updateIngredient(index,"wastePercent",+e.target.value)}/></Field>{form.ingredients.length>1&&<button type="button" className="table-action" onClick={()=>setForm({...form,ingredients:form.ingredients.filter((_:any,i:number)=>i!==index)})}>Remove</button>}</div>)}<button type="button" className="outline-button" onClick={()=>setForm({...form,ingredients:[...form.ingredients,{productId:"",quantity:1,wastePercent:0}]})}>+ {industry.inputLabel}</button><Field label="Transaction notes" help="Optional context for the production run, such as batch number or quality notes."><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field><button>Save controlled version</button></form></section></div>}
    {running&&<div className="modal record-editor"><section><button className="close" onClick={()=>setRunning(undefined)}>×</button><h2>Record {industry.productionLabel.toLowerCase()} · {running.productName}</h2><p>{industry.inputLabel} stock will be deducted and output stock added atomically. The operation cannot partially save.</p><form className="item-form" onSubmit={completeRun}><Field label="Output quantity"><input required type="number" min={products.find(p=>p.id===running.productId)?.trackingMode==="Discrete"?"1":".001"} step={products.find(p=>p.id===running.productId)?.trackingMode==="Discrete"?"1":".001"} value={run.quantity} onChange={e=>setRun({...run,quantity:+e.target.value})}/></Field><Field label="Batch / transaction notes"><input value={run.notes} onChange={e=>setRun({...run,notes:e.target.value})}/></Field><button>Complete stock transaction</button></form></section></div>}
  </Page>
}
function Expenses({user,notify}:{user:{role:string},notify:(x:string)=>void}) {
  const today=new Date().toISOString().slice(0,10), month=new Date();month.setDate(1);
  const blank={date:today,category:"Inventory",description:"",amount:0,initiallyPaid:0,method:"Cash",payee:"",reference:"",dueDate:"",taxAmount:0,notes:"",recurring:false};
  const [category, setCategory] = useState("All"),[status,setStatus]=useState("All"),[from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[rows,setRows]=useState<any[]>([]),[adding,setAdding]=useState(false),[form,setForm]=useState(blank),[paying,setPaying]=useState<any>(),[payment,setPayment]=useState({amount:0,method:"Cash",reference:"",notes:""}),[editing,setEditing]=useState<any>();
  const canAdd=canAccess(user,"expenses"),canManage=canAccess(user,"approvals");
  const load=async(filters?:{from?:string;to?:string;category?:string;status?:string})=>{try{const data=await getProductionExpenses(filters?.from??from,filters?.to??to,filters?.category??category,filters?.status??status);setRows(data);return data}catch(error){notify(error instanceof Error?error.message:"Expenses could not be refreshed");return []}};
  useEffect(()=>{void load()},[category,status]);
  useEffect(()=>{let timer=0;const changed=(event:Event)=>{const path=(event as CustomEvent<any>).detail?.path||"";if(!path.startsWith("/expenses"))return;clearTimeout(timer);timer=window.setTimeout(()=>void load(),60)};addEventListener("thebarcode:data-changed",changed);return()=>{removeEventListener("thebarcode:data-changed",changed);clearTimeout(timer)}},[from,to,category,status]);
  async function addExpense(e:FormEvent){e.preventDefault();try{await createProductionExpense({...form,dueDate:form.dueDate||null,branchId:null,deviceId:localStorage.getItem("device_id")||"expense-ui"});const savedDate=form.date,nextFrom=savedDate<from?savedDate:from,nextTo=savedDate>to?savedDate:to;setAdding(false);setForm(blank);setCategory("All");setStatus("All");setFrom(nextFrom);setTo(nextTo);await load({from:nextFrom,to:nextTo,category:"All",status:"All"});dispatchEvent(new Event("dukora:attention"));notify("Expense recorded and shown in the register")}catch(error){notify(error instanceof Error?error.message:"Expense could not be saved")}}
  async function settle(e:FormEvent){e.preventDefault();try{const result=await payExpense(paying.id,{...payment,deviceId:localStorage.getItem("device_id")||"expense-ui"});setRows(current=>current.map(row=>row.id===paying.id?{...row,paidAmount:Number(result.paidAmount),balance:Number(result.balance),method:payment.method,payments:[result.payment,...(row.payments||[])]}:row));setPaying(undefined);setPayment({amount:0,method:"Cash",reference:"",notes:""});await load();dispatchEvent(new Event("dukora:attention"));notify("Expense payment recorded and balance updated")}catch(error){notify(error instanceof Error?error.message:"Payment could not be saved")}}
  async function saveEdit(e:FormEvent){e.preventDefault();try{await updateExpense(editing.id,{date:editing.date,category:editing.category,description:editing.description,amount:+editing.amount,method:editing.method,payee:editing.payee,reference:editing.reference,dueDate:editing.dueDate||null,taxAmount:+editing.taxAmount||0,notes:editing.notes,recurring:Boolean(editing.recurring),active:Boolean(editing.active),reason:editing.reason});setEditing(undefined);await load();dispatchEvent(new Event("dukora:attention"));notify("Expense details updated")}catch(error){notify(error instanceof Error?error.message:"Expense could not be updated")}}
  async function approve(id:string){try{await approveExpense(id);await load();dispatchEvent(new Event("dukora:attention"));notify("Expense approved and included in live reporting")}catch(error){notify(error instanceof Error?error.message:"Expense could not be approved")}}
  const categories=Array.from(new Set(rows.map(x=>x.category))), grouped=Array.from(rows.reduce<Map<string,number>>((m,x)=>m.set(x.category,(m.get(x.category)||0)+Number(x.amount)),new Map<string,number>())).map(([name,v])=>({name,v}));
  return (
    <Page>
      <Intro
        title="Expenses & suppliers"
        text="Explore costs by period, category and payment status."
        action={canAdd?"＋ Add expense":undefined}
        onAction={canAdd?()=>setAdding(true):undefined}
      />
      <Filter>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {["All", ...categories].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option><option value="PendingApproval">Pending approval</option><option>Approved</option><option>Archived</option></select>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
        <span>to</span>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
        <button onClick={()=>void load()}>Apply filters</button>
      </Filter>
      <Kpis
        items={[
          [
            "Filtered total",
            money(rows.reduce((s, x) => s + x.amount, 0)),
            `${rows.length} records`,
          ],
          ["Unpaid balance", money(rows.reduce((s,x)=>s+Number(x.amount)-Number(x.paidAmount),0)), "Recorded outstanding amount"],
          ["Cash expenses", money(rows.filter(x=>x.method==="Cash").reduce((s,x)=>s+Number(x.amount),0)), "Selected range"],
        ]}
      />
      <Two>
        <Panel title="Expenses by category">
          <Chart>
            <BarChart
              data={grouped}
            >
              <CartesianGrid vertical={false} stroke="#e4ebe7" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="v" fill="#ff7542" radius={[5, 5, 0, 0]} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Expense records over time">
          <Chart>
            <LineChart
              data={rows.slice().reverse().map(x=>({m:new Date(x.date).toLocaleDateString(undefined,{month:"short",day:"numeric"}),v:x.amount}))}
            >
              <CartesianGrid vertical={false} stroke="#e4ebe7" />
              <XAxis dataKey="m" axisLine={false} tickLine={false} />
              <Tooltip />
              <Line dataKey="v" stroke="#25815f" strokeWidth={3} />
            </LineChart>
          </Chart>
        </Panel>
      </Two>
      <Panel title="Filtered expenses">
        <Table
          heads={["Date","Description", "Payee", "Category", "Amount","Paid","Balance", "Status","Action"]}
          rows={rows.map((x) => [
            new Date(`${x.date}T00:00:00`).toLocaleDateString(),
            x.description,
            x.payee||"—",
            x.category,
            money(x.amount),
            money(x.paidAmount),money(x.balance),
            !x.active?"Archived":x.status==="PendingApproval"?"Pending approval":Number(x.balance)<=0?"Approved · paid":Number(x.paidAmount)>0?"Approved · partially paid":"Approved · unpaid",
            canManage?<div className="button-row" key={x.id}>{x.status==="PendingApproval"&&<button className="table-action" onClick={()=>void approve(x.id)}>Approve</button>}{Number(x.balance)>0&&x.active&&x.status==="Approved"&&<button className="table-action" onClick={()=>{setPaying(x);setPayment({...payment,amount:Number(x.balance)})}}>Pay</button>}<button className="table-action" onClick={()=>setEditing({...x,reason:""})}>Edit</button></div>:"Submitted",
          ])}
        />
      </Panel>
      {adding&&<div className="modal record-editor"><section><button className="close" onClick={()=>setAdding(false)}>×</button><h2>Add expense</h2><form className="item-form" onSubmit={addExpense}><Field label="Expense date"><input type="date" required value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Field><Field label="Category"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{["Inventory","Utilities","Rent","Payroll","Maintenance","Transport","Marketing","Tax","Supplies","Other"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Description"><input required value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field><Field label="Supplier / payee"><input value={form.payee} onChange={e=>setForm({...form,payee:e.target.value})}/></Field><Field label="Invoice / receipt reference"><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></Field><Field label="Due date"><input type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></Field><Field label="Total amount"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={e=>setForm({...form,amount:+e.target.value})}/></Field><Field label="Initially paid"><input type="number" min="0" max={form.amount} step="0.01" value={form.initiallyPaid} onChange={e=>setForm({...form,initiallyPaid:+e.target.value})}/></Field><Field label="Payment method"><select value={form.method} onChange={e=>setForm({...form,method:e.target.value})}>{["Cash","M-Pesa","Bank","Card","Pending"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Tax included"><input type="number" min="0" step="0.01" value={form.taxAmount} onChange={e=>setForm({...form,taxAmount:+e.target.value})}/></Field><Field label="Notes"><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field><label className="check"><input type="checkbox" checked={form.recurring} onChange={e=>setForm({...form,recurring:e.target.checked})}/> Recurring obligation</label><button className="save-item">Save expense</button></form></section></div>}
      {paying&&<div className="modal record-editor"><section><button className="close" onClick={()=>setPaying(undefined)}>×</button><h2>Pay expense</h2><p>{paying.description} · outstanding {money(paying.balance)}</p><form className="customer-form" onSubmit={settle}><Field label="Amount"><input type="number" min="0.01" max={paying.balance} step="0.01" required value={payment.amount} onChange={e=>setPayment({...payment,amount:+e.target.value})}/></Field><Field label="Method"><select value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}>{["Cash","M-Pesa","Bank","Card"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Payment reference"><input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></Field><Field label="Notes"><input value={payment.notes} onChange={e=>setPayment({...payment,notes:e.target.value})}/></Field><button>Record payment</button></form></section></div>}
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit expense</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Expense date"><input required type="date" value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value})}/></Field><Field label="Category"><input required value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></Field><Field label="Description"><input required value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></Field><Field label="Amount"><input required type="number" min={editing.paidAmount||0.01} step="0.01" value={editing.amount} onChange={e=>setEditing({...editing,amount:+e.target.value})}/></Field><Field label="Payment method"><select required value={editing.method} onChange={e=>setEditing({...editing,method:e.target.value})}>{["Cash","M-Pesa","Bank","Credit","Other"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Supplier / payee"><input value={editing.payee||""} onChange={e=>setEditing({...editing,payee:e.target.value})}/></Field><Field label="Reference"><input value={editing.reference||""} onChange={e=>setEditing({...editing,reference:e.target.value})}/></Field><Field label="Due date"><input type="date" value={editing.dueDate||""} onChange={e=>setEditing({...editing,dueDate:e.target.value})}/></Field><Field label="Tax"><input type="number" min="0" step="0.01" value={editing.taxAmount||0} onChange={e=>setEditing({...editing,taxAmount:+e.target.value})}/></Field><Field label="Notes"><input value={editing.notes||""} onChange={e=>setEditing({...editing,notes:e.target.value})}/></Field><Field label="Reason for change"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><label><input type="checkbox" checked={editing.recurring} onChange={e=>setEditing({...editing,recurring:e.target.checked})}/> Recurring</label><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label><button>Save controlled change</button></form></section></div>}
    </Page>
  );
}
function Accounting({user}:{user:{role:string}}) {
  const today=new Date().toISOString().slice(0,10),month=new Date();month.setDate(1);
  const [from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[data,setData]=useState<any>(),[trial,setTrial]=useState<any[]>([]),[journals,setJournals]=useState<any[]>([]),[busy,setBusy]=useState(false);
  const permitted=canAccess(user,"accounting");
  const load=async()=>{if(!permitted)return;setBusy(true);try{const [overview,tb,je]=await Promise.all([getAccountingOverview(from,to),getAccountingTrialBalance(from,to),getAccountingJournals(from,to)]);setData(overview);setTrial(tb);setJournals(je)}catch{}finally{setBusy(false)}};
  useEffect(()=>{let refreshing=false;const refresh=()=>{if(refreshing||document.visibilityState!=="visible")return;refreshing=true;void load().finally(()=>{refreshing=false})};refresh();addEventListener("thebarcode:data-changed",refresh);addEventListener("dukora:attention",refresh);addEventListener("focus",refresh);const timer=window.setInterval(refresh,60000);return()=>{removeEventListener("thebarcode:data-changed",refresh);removeEventListener("dukora:attention",refresh);removeEventListener("focus",refresh);clearInterval(timer)}},[from,to,permitted]);
  if(!permitted)return <Page><Intro title="Accounting" text="Ledger and financial statements are protected by role."/><Panel title="Restricted access"><p>Accounting is available to Owners, Managers and Auditors.</p></Panel></Page>;
  const amount=(v:unknown)=>Number(v||0), debitTotal=trial.reduce((sum,x)=>sum+amount(x.debit),0),creditTotal=trial.reduce((sum,x)=>sum+amount(x.credit),0),balanced=Math.abs(debitTotal-creditTotal)<0.005;
  const tone=(value:unknown)=>amount(value)>0?"accounting-positive":amount(value)<0?"accounting-negative":"accounting-zero";
  const chartData=trial.slice(0,12).map(x=>({code:x.code,name:x.name,debit:amount(x.debit),credit:amount(x.credit)}));
  const classes=Object.values(trial.reduce((acc:any,x:any)=>{const key=x.type||"Other";acc[key]??={type:key,debit:0,credit:0};acc[key].debit+=amount(x.debit);acc[key].credit+=amount(x.credit);return acc},{}));
  return <Page><Intro title="Accounting" text="Live financial position from posted sales, payments, inventory and approved expenses." action={busy?"Refreshing…":"Refresh"} onAction={()=>void load()}/><Filter><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><span>to</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></Filter>
    <Kpis items={[["Revenue",ledgerText(data?.revenue||0),`${data?.salesCount||0} posted sales`,tone(data?.revenue)], ["Gross profit",ledgerText(data?.grossProfit||0),"Revenue less cost of goods",tone(data?.grossProfit)], ["Net profit",ledgerText(data?.netProfit||0),"After approved expenses",tone(data?.netProfit)], ["Receivables",ledgerText(data?.receivables||0),"Outstanding at period end",tone(data?.receivables)]]}/>
    <Two><Panel title="Statement of profit or loss"><Table heads={["Measure","Amount"]} rows={[["Revenue",<LedgerAmount value={data?.revenue}/>],["Cost of goods sold",<LedgerAmount value={-amount(data?.cost)}/>],["Gross profit",<LedgerAmount value={data?.grossProfit}/>],["Operating expenses",<LedgerAmount value={-amount(data?.expenses)}/>],["Net profit",<LedgerAmount value={data?.netProfit}/>],["Cash collected",<LedgerAmount value={data?.collected}/>],["Accounts receivable",<LedgerAmount value={data?.receivables}/>],["Accounts payable",<LedgerAmount value={data?.payables}/>]]}/></Panel>
      <Panel title="Trial balance"><div className="accounting-balance-head"><span className={balanced?"accounting-balance-good":"accounting-balance-bad"}>{balanced?"Balanced":"Out of balance"}</span><small>As at {to}</small></div><Table heads={["Account","Type","Debit","Credit"]} rows={trial.map(x=>[`${x.code} · ${x.name}`,x.type,<LedgerAmount value={x.debit}/>,<LedgerAmount value={x.credit}/>])}/><p className="accounting-chart-note">Debit total <LedgerAmount value={debitTotal}/> · Credit total <LedgerAmount value={creditTotal}/></p></Panel></Two>
    <Two><Panel title="Debit and credit by account"><Chart><BarChart data={chartData} layout="vertical" margin={{left:0,right:28,top:4,bottom:4}}><CartesianGrid horizontal={false} stroke="#e4ebe7"/><XAxis type="number" hide/><YAxis type="category" dataKey="code" width={42} tick={{fontSize:9,fill:"#61736b"}}/><Tooltip labelFormatter={(label:any)=>{const account=chartData.find(x=>x.code===label);return account?`${account.code} · ${account.name}`:String(label)}} formatter={(value:any)=>ledgerText(value)}/><Bar dataKey="debit" stackId="ledger" fill="#2f8065" radius={[0,3,3,0]}><LabelList dataKey="debit" position="right" formatter={(value:any)=>amount(value)?amount(value).toLocaleString():""}/></Bar><Bar dataKey="credit" stackId="ledger" fill="#d9a34c" radius={[0,3,3,0]}><LabelList dataKey="credit" position="right" formatter={(value:any)=>amount(value)?amount(value).toLocaleString():""}/></Bar></BarChart></Chart><div className="accounting-chart-legend"><span className="debit">Debit</span><span className="credit">Credit</span></div><p className="accounting-chart-note">Account balances through the selected period end.</p></Panel>
      <Panel title="Accounts by class"><Table heads={["Class","Debit","Credit"]} rows={classes.map((x:any)=>[x.type,<LedgerAmount value={x.debit}/>,<LedgerAmount value={x.credit}/>])}/><p className="accounting-chart-note">A balanced trial balance confirms total debits equal total credits.</p></Panel></Two>
    <Panel title="Journal history (immutable)"><p className="accounting-journal-note">Each transaction is balanced across its affected accounts. Superseded snapshots are retained for audit and shown struck through; only the latest active snapshot feeds the trial balance.</p><Table heads={["Date","Source","Memo","Status","Lines"]} rowClasses={journals.map(x=>x.status==="Superseded"?"journal-superseded":"")} rows={journals.map(x=>[String(x.date),x.sourceType,x.memo,x.status,String(x.lines?.length||0)])}/></Panel></Page>;
}
function buildReportTrendData(detail:any,from:string,to:string) {
  const start=new Date(`${from}T00:00:00Z`),end=new Date(`${to}T00:00:00Z`);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)return [];
  const spanDays=Math.floor((end.getTime()-start.getTime())/86400000)+1;
  const unit=spanDays<=90?"day":spanDays<=730?"week":"month";
  const keyFor=(date:string)=>{
    const d=new Date(`${date}T00:00:00Z`);
    if(unit==="month")return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
    if(unit==="week"){
      const monday=new Date(d);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
      return monday.toISOString().slice(0,10);
    }
    return date;
  };
  const buckets=new Map<string,any>();
  const merge=(date:string,values:any)=>{const key=keyFor(date),row=buckets.get(key)||{date:key,revenue:0,profit:0,expenses:0,inflow:0,outflow:0};for(const field of ["revenue","profit","expenses","inflow","outflow"])row[field]+=Number(values[field]||0);buckets.set(key,row)};
  for(const row of detail?.daily||[])merge(String(row.date),{revenue:row.revenue,profit:row.profit});
  for(const row of detail?.dailyExpenses||[])merge(String(row.date),{expenses:row.amount});
  for(const row of detail?.dailyStockFlow||[])merge(String(row.date),{inflow:row.inflow,outflow:row.outflow});
  if(!buckets.size)return [];
  if(unit==="day"){
    for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){const key=d.toISOString().slice(0,10);if(!buckets.has(key))buckets.set(key,{date:key,revenue:0,profit:0,expenses:0,inflow:0,outflow:0})}
  }else if(unit==="week"){
    const d=new Date(start);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
    while(d<=end){const key=d.toISOString().slice(0,10);if(!buckets.has(key))buckets.set(key,{date:key,revenue:0,profit:0,expenses:0,inflow:0,outflow:0});d.setUTCDate(d.getUTCDate()+7)}
  }else{
    const d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));
    while(d<=end){const key=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;if(!buckets.has(key))buckets.set(key,{date:key,revenue:0,profit:0,expenses:0,inflow:0,outflow:0});d.setUTCMonth(d.getUTCMonth()+1)}
  }
  return [...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(row=>({...row,label:unit==="month"?new Date(`${row.date}-01T00:00:00Z`).toLocaleDateString(undefined,{month:"short",year:"2-digit",timeZone:"UTC"}):new Date(`${row.date}T00:00:00Z`).toLocaleDateString(undefined,{month:"short",day:"numeric",timeZone:"UTC"})}));
}

function Reports({user}:{user:{role:string}}) {
  const today=new Date().toISOString().slice(0,10), month=new Date();month.setDate(1);
  const [range, setRange] = useState("This month"),[from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[summary,setSummary]=useState<any>(null),[detail,setDetail]=useState<any>(null),[accounting,setAccounting]=useState<any>(null),[productionRuns,setProductionRuns]=useState<any[]>([]),[reportBusy,setReportBusy]=useState(false);
  const permitted=canAccess(user,"reports"),modules=enabledModules(cachedOrganizationSettings().enabledModules),accountingVisible=modules.has("accounting")&&canAccess(user,"accounting"),productionVisible=modules.has("production")&&canAccess(user,"inventory");
  const load=async()=>{if(!permitted)return null;setReportBusy(true);try{const results=await Promise.allSettled([getOperationalOverview(from,to),accountingVisible?getAccountingOverview(from,to):Promise.resolve(null),productionVisible?getProductionRuns():Promise.resolve([])]);const d=results[0].status==="fulfilled"?results[0].value:null;setSummary(d);setDetail(d);setAccounting(results[1].status==="fulfilled"?results[1].value:null);setProductionRuns(results[2].status==="fulfilled"?results[2].value:[]);return d?{summary:d,detail:d,accounting:results[1].status==="fulfilled"?results[1].value:null,productionRuns:results[2].status==="fulfilled"?results[2].value:[]}:null}catch{setSummary(null);setDetail(null);return null}finally{setReportBusy(false)}};useEffect(()=>{const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer)},[from,to,permitted,accountingVisible,productionVisible]);
  const applyPreset=(preset:string)=>{setRange(preset);const end=new Date(),start=new Date(end);if(preset==="This week")start.setDate(start.getDate()-6);else if(preset==="This month")start.setDate(1);setFrom(start.toISOString().slice(0,10));setTo(end.toISOString().slice(0,10))};
  const downloadLatest=async()=>{const latest=await load();if(!latest)return;let accountingTrial:any[]=[];if(accountingVisible)try{accountingTrial=await getAccountingTrialBalance(from,to)}catch{}await downloadPdfReport({from,to,...latest,accountingTrial})};
  const gross=(summary?.revenue??0)-(summary?.cost??0),net=gross-(summary?.expenses??0);
  const trendData=buildReportTrendData(detail,from,to);
  const productionRows=productionRuns.filter(x=>String(x.occurredAt).slice(0,10)>=from&&String(x.occurredAt).slice(0,10)<=to);
  const currency=(value:any)=>`${cachedOrganizationSettings().currency||"KES"} ${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  if(!permitted)return <Page><Intro title="Historical reports" text="Role-based financial access protects business-sensitive information."/><Panel title="Restricted access"><p>Full financial reports are available to Owners and Managers, with read-only access for Auditors. Cashiers use their Sell and Bills views; Storekeepers use Inventory reporting.</p></Panel></Page>;
  return (
    <Page>
      <Intro
        title="Historical reports & shift close"
        text={`${range} · Synced and on-device records included.`}
      />
      <div className="range-tabs">
        {["Today", "This week", "This month", "Custom range"].map((x) => (
          <button
            className={range === x ? "active" : ""}
            onClick={() => x==="Custom range"?setRange(x):applyPreset(x)}
            key={x}
          >
            {x}
          </button>
        ))}
        <input type="date" value={from} onChange={e=>{setRange("Custom range");setFrom(e.target.value)}} />
        <span>to</span>
        <input type="date" value={to} onChange={e=>{setRange("Custom range");setTo(e.target.value)}} />
        <button className="apply" disabled={reportBusy} onClick={()=>void load()}>{reportBusy?"Refreshing…":"Refresh report"}</button>
      </div>
      <Kpis
        items={[
          ["Revenue", money(summary?.revenue??0), `${summary?.salesCount??0} sales · ${Number(summary?.collectionRate??0).toFixed(1)}% collected`],
          ["Cost of goods", money(summary?.cost??0), "Recorded sale-item cost"],
          ["Gross profit", money(gross), summary?.revenue?`${(gross/summary.revenue*100).toFixed(1)}%`:"0%"],
          ["Expenses", money(summary?.expenses??0), "Selected range"],
        ]}
      />
      <Kpis items={[
        ["Net profit",money(net),"Gross profit less approved operating expenses"],
        ["Cash collected",money(summary?.cashCollected??0),"Payments recorded in the selected period"],
        ["Receivables",money(accounting?.receivables??summary?.customerDebt??0),"Outstanding at period end"],
        ["Inventory value",money(summary?.stockValue??0),"Current on-hand value at latest refresh"],
      ]}/>
      <Two>
        <Panel title="Profit & loss">
          <Table
            heads={["Line", "Amount"]}
            rows={[
              ["Sales revenue", money(summary?.revenue??0)],
              ["Cost of goods", `(${money(summary?.cost??0)})`],
              ["Gross profit", money(gross)],
              ["Expenses", `(${money(summary?.expenses??0)})`],
              ["Net profit", money(net)],
            ]}
          />
        </Panel>
        <Panel title="PDF management report">
          <div className="export-card">
            <i>⇩</i>
            <p>
              Generate a concise branded PDF containing verified KPI formulas,
              daily performance visuals, payment mix, top sellers, stock risks and expenses.
            </p>
            <button disabled={reportBusy} onClick={()=>void downloadLatest()}>
              {reportBusy?"Refreshing latest data…":"⇩ Download PDF report"}
            </button>
          </div>
        </Panel>
      </Two>
      <Panel title="Business trends">
        <p className="report-section-note">Sales and gross profit, approved expenses, and stock movement are plotted by day for ranges up to 90 days, by week up to two years, and by month for longer ranges. Quiet periods are shown as zero. Hover or focus chart points to inspect exact values.</p>
        {!trendData.length?<div className="report-empty">No dated transactions are available for this period.</div>:<div className="report-chart-grid">
          <section className="report-chart-card"><h4>Sales and gross profit</h4><Chart><AreaChart data={trendData}><defs><linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f8065" stopOpacity={0.26}/><stop offset="95%" stopColor="#2f8065" stopOpacity={0.02}/></linearGradient><linearGradient id="profitTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d9a34c" stopOpacity={0.2}/><stop offset="95%" stopColor="#d9a34c" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--hairline)"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} width={52}/><Tooltip formatter={(v:any)=>currency(v)}/><Area type="monotone" dataKey="revenue" name="Sales revenue" stroke="#2f8065" strokeWidth={2.5} fill="url(#salesTrendFill)"/><Area type="monotone" dataKey="profit" name="Gross profit" stroke="#c18b34" strokeWidth={2} fill="url(#profitTrendFill)"/></AreaChart></Chart></section>
          <section className="report-chart-card"><h4>Approved operating expenses</h4><Chart><AreaChart data={trendData}><defs><linearGradient id="expenseTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c56d5b" stopOpacity={0.2}/><stop offset="95%" stopColor="#c56d5b" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--hairline)"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} width={52}/><Tooltip formatter={(v:any)=>currency(v)}/><Area type="monotone" dataKey="expenses" name="Approved expenses" stroke="#b96655" strokeWidth={2.5} fill="url(#expenseTrendFill)"/></AreaChart></Chart></section>
          <section className="report-chart-card"><h4>Inventory movement</h4><Chart><AreaChart data={trendData}><defs><linearGradient id="inflowTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f8065" stopOpacity={0.2}/><stop offset="95%" stopColor="#2f8065" stopOpacity={0.01}/></linearGradient><linearGradient id="outflowTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d18a52" stopOpacity={0.18}/><stop offset="95%" stopColor="#d18a52" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--hairline)"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} width={42}/><Tooltip formatter={(v:any)=>Number(v||0).toLocaleString()}/><Area type="monotone" dataKey="inflow" name="Stock added" stroke="#2f8065" strokeWidth={2.5} fill="url(#inflowTrendFill)"/><Area type="monotone" dataKey="outflow" name="Stock used or sold" stroke="#c37b42" strokeWidth={2} fill="url(#outflowTrendFill)"/></AreaChart></Chart></section>
          <section className="report-chart-card"><h4>Collections by payment method</h4><Chart><BarChart data={detail?.paymentMix||[]}><CartesianGrid vertical={false} stroke="var(--hairline)"/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} width={52}/><Tooltip formatter={(v:any)=>currency(v)}/><Bar dataKey="amount" name="Collected" fill="#518b7b" radius={[5,5,0,0]}/></BarChart></Chart><p className="report-chart-caption">Recorded payment entries. This is not a counted till variance.</p></section>
        </div>}
      </Panel>
      {accountingVisible&&accounting&&<Two>
        <Panel title="Receivables ageing · as at period end"><p className="report-section-note">Open customer balances aged by due date, or sale date when no due date was set.</p><Table heads={["Age band","Amount"]} rows={[["Not yet due",currency(accounting.receivablesAging?.current)],["1–30 days overdue",currency(accounting.receivablesAging?.overdue1To30)],["31–60 days overdue",currency(accounting.receivablesAging?.overdue31To60)],["Over 60 days overdue",currency(accounting.receivablesAging?.overdueOver60)]]}/></Panel>
        <Panel title="Payables ageing · as at period end"><p className="report-section-note">Approved unpaid expenses aged by due date, or expense date when no due date was set.</p><Table heads={["Age band","Amount"]} rows={[["Not yet due",currency(accounting.payablesAging?.current)],["1–30 days overdue",currency(accounting.payablesAging?.overdue1To30)],["31–60 days overdue",currency(accounting.payablesAging?.overdue31To60)],["Over 60 days overdue",currency(accounting.payablesAging?.overdueOver60)]]}/></Panel>
      </Two>}
      <Two>
        <Panel title="Stock movement for the period"><Table heads={["Measure","Quantity / items","Value"]} rows={[["Stock received",Number(summary?.stockInflow||0).toLocaleString(),currency(summary?.stockInflowValue)],["Stock used or sold",Number(summary?.stockOutflow||0).toLocaleString(),currency(summary?.stockOutflowValue)],["Inventory purchases","—",money(summary?.inventoryPurchases||0)],["Low or projected low",String(summary?.lowStockCount||0),"Current risk count"]]}/><p className="report-section-note">Inventory purchases are tracked separately from operating expenses so they do not reduce profit twice.</p></Panel>
        <Panel title="Collections recorded by method"><Table heads={["Method","Collected"]} rows={(detail?.paymentMix||[]).map((x:any)=>[x.name,currency(x.amount)])}/>{!detail?.paymentMix?.length&&<p className="report-empty">No payments were recorded in this period.</p>}<p className="report-section-note">The app does not yet store an independent counted cash value, so it reports posted collections without claiming a till variance.</p></Panel>
      </Two>
      {productionVisible&&<Panel title={"Production costing · "+productionRows.length+" runs"}><p className="report-section-note">Ingredient costs are the saved values from each production run.</p>{productionRows.length?<div className="production-report-list">{productionRows.map((run:any)=><details key={run.id}><summary><span><b>{run.productName}</b><small>{new Date(run.occurredAt).toLocaleString()} · {run.quantityProduced} produced</small></span><strong>{currency(run.totalCost)} total · {currency(run.unitCost)} per unit</strong></summary><Table heads={["Ingredient","Quantity","Unit cost","Line cost"]} rows={(run.ingredients||[]).map((line:any)=>[line.ingredientName||line.name||"Ingredient",String(line.quantity)+" "+(line.unit||""),currency(line.unitCost),currency(line.totalCost??line.cost)])}/></details>)}</div>:<div className="report-empty">No production runs fall within this period.</div>}</Panel>}
    </Page>
  );
}

function SmartInsights({user}:{user:{role:string}}){
  const today=new Date().toISOString().slice(0,10), start=new Date();start.setDate(start.getDate()-29);
  const [from,setFrom]=useState(start.toISOString().slice(0,10)),[to,setTo]=useState(today),[data,setData]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const permitted=canAccess(user,"reports");const load=()=>{if(!permitted){setError("Smart Insights requires an assigned Reports permission or an authorised management role.");return}setLoading(true);setError("");getInsights(from,to).then(setData).catch(e=>{setData(null);setError(e instanceof Error?e.message:"Smart Insights could not load")}).finally(()=>setLoading(false))};useEffect(()=>{const timer=setTimeout(load,300);return()=>clearTimeout(timer)},[from,to,permitted]);
  return <Page>
    <Intro title="Smart insights" text="Live business signals from sales, stock, customer credit and expenses." action={data?.mode==="ai"?"✦ AI analysis active":"◆ Rule engine active"}/>
    <Filter><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><span>to</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/><button onClick={load}>{loading?"Analysing…":"Refresh insights"}</button></Filter>
    <Panel title="Business briefing"><p className={`insight-summary ${error?"insight-error":""}`}>{data?.summary??(loading?"Analysing live records…":error||"No insight data is available for this period.")}</p><small>{data?.providerStatus||"Built-in rule engine"} · No customer phone numbers or receipt-level data are sent to an AI provider.</small></Panel>
    <div className="insight-grid">{(data?.insights??[]).map((x:any)=><article className={`insight-card ${x.severity}`} key={x.id}><header><span>{x.category}</span><b>{x.metric}</b></header><h3>{x.title}</h3><p>{x.description}</p><footer><strong>Suggested action</strong>{x.recommendation}</footer></article>)}</div>
    <Panel title="How analysis works"><p>Without an enabled AI provider, TheBarcode always uses its built-in deterministic rules. Owners can configure an HTTPS chat-model endpoint, model and API key in Settings. The key is encrypted by the local server and is never returned to the browser.</p></Panel>
  </Page>
}
function Audit({user}:{user:{role:string}}) {
  const [remote, setRemote] = useState<any[]>([]),[action,setAction]=useState("All actions"),[actor,setActor]=useState("All users"),[date,setDate]=useState("");
  const permitted=canAccess(user,"audit");
  useEffect(() => {
    if(!permitted)return;
    getAudit()
      .then(setRemote)
      .catch(() => setRemote([]));
  }, [permitted]);
  if(!permitted)return <Page><Intro title="Audit trail" text="Every sensitive action is timestamped with user, device and sync status."/><Panel title="Restricted access"><p>The audit trail is available to Owners, Managers and Auditors. Sign in with an authorised staff account to review it.</p></Panel></Page>;
  const filtered=remote.filter(x=>(action==="All actions"||x.entityType===action)&&(actor==="All users"||x.actor===actor)&&(!date||String(x.occurredAt).startsWith(date)));
  const rows = filtered.map(x=>[new Date(x.occurredAt).toLocaleString(),x.actor,`${x.action} ${x.entityType}`,x.details,x.deviceId||"Server","Synced"]);
  return (
    <Page>
      <Intro
        title="Audit trail"
        text="Every sensitive action is timestamped with user, device and sync status."
      />
      <Filter>
        <select value={action} onChange={e=>setAction(e.target.value)}>
          <option>All actions</option>
          <option value="Sale">Sale</option><option value="Product">Product</option><option value="Customer">Customer</option><option value="Staff">Staff</option><option value="Expense">Expense</option>
        </select>
        <select value={actor} onChange={e=>setActor(e.target.value)}>
          <option>All users</option>
          {Array.from(new Set(remote.map(x=>x.actor))).map(x=><option key={String(x)}>{String(x)}</option>)}
        </select>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
        <button onClick={()=>{setAction("All actions");setActor("All users");setDate("")}}>Reset filters</button>
      </Filter>
      <Panel title={`Activity · ${rows.length} records`}>
        <Table
          heads={["Time", "User", "Action", "Record", "Device", "Sync"]}
          rows={rows}
        />
      </Panel>
    </Page>
  );
}
function SystemLogsView({user}:{user:{role:string}}){
  const [rows,setRows]=useState<any[]>([]),[level,setLevel]=useState("All");
  const [health,setHealth]=useState<any>(),[pending,setPending]=useState(0),[failed,setFailed]=useState(0),[lastSynced,setLastSynced]=useState(""),[backup,setBackup]=useState<any>();
  const permitted=user.role==="Owner"||user.role==="Manager";
  const load=()=>{if(!permitted)return;let local:any[]=[];try{local=JSON.parse(localStorage.getItem("barcode_system_logs")||"[]")}catch{}getSystemLogs().then((remote:any[])=>setRows([...local,...remote].sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime()))).catch(()=>setRows(local));getSystemHealth().then(setHealth).catch(()=>setHealth(undefined));void db.outbox.toArray().then(items=>{setPending(items.length);setFailed(items.filter(x=>Boolean(x.lastError)).length)});setLastSynced(local.find(x=>String(x.path).startsWith("Sync ")&&x.level==="Info")?.occurredAt||"");if(user.role==="Owner")getMaintenanceBackups().then((items:any[])=>setBackup(items[0])).catch(()=>0)};
  useEffect(()=>{load();const changed=()=>{if(document.visibilityState==="visible")load()};addEventListener("focus",changed);const timer=setInterval(changed,60000);return()=>{removeEventListener("focus",changed);clearInterval(timer)}},[permitted]);
  const filtered=rows.filter(x=>level==="All"||x.level===level);
  const reads=getReadPerformance();
  return <Page><Intro title="System logs" text="Technical operation history for troubleshooting saves, synchronization and server-side failures. Local offline sync attempts are shown alongside server records. This is separate from the staff access audit."/>{!permitted?<Panel title="Restricted access"><p>System logs are available to owners and managers only.</p></Panel>:<><Panel title="Performance & sync health"><div className="system-health-grid"><span><b>Local database</b><small>{health?.database||"Checking…"} · {health?.provider||""}{health?.databaseBytes!=null?` · ${(health.databaseBytes/1048576).toFixed(1)} MB`:""}</small></span><span><b>Pending changes</b><small>{pending} queued · {failed} need attention</small></span><span><b>Last confirmed sync</b><small>{lastSynced?new Date(lastSynced).toLocaleString():"No confirmed sync recorded on this device"}</small></span><span><b>Latest manual backup</b><small>{user.role==="Owner"?(backup?new Date(backup.createdAt).toLocaleString():"No manual backup found"):"Owner-only detail"}</small></span><span><b>Read cache</b><small>{reads.hits} reused · {reads.requests} requests · {reads.coalesced} combined</small></span></div><p className="muted">Business writes and stock validation always use the local database. Cached displays expire quickly and are cleared after changes.</p>{health?.slowRequests?.length>0&&<details><summary>Recent slow requests ({health.slowRequests.length})</summary><Table heads={["Time","Request","Duration","Status"]} rows={health.slowRequests.map((x:any)=>[new Date(x.at).toLocaleString(),`${x.method} ${x.path}`,`${x.durationMs} ms`,String(x.statusCode)])}/></details>}</Panel><Filter><select value={level} onChange={e=>setLevel(e.target.value)}><option>All</option><option>Info</option><option>Warning</option><option>Error</option></select><span>{filtered.length} of {rows.length} recent events</span><button type="button" onClick={load}>Refresh</button></Filter><Panel title="System activity"><Table heads={["Time","Level","Operation","Actor","Result","Duration","Records","Correlation","Details"]} rows={filtered.map(x=>[new Date(x.occurredAt).toLocaleString(),x.level,`${x.method} ${x.path}`,x.actor,`HTTP ${x.statusCode}`,`${x.durationMs} ms`,x.rowsAffected??"—",x.correlationId||"Local",x.message])}/></Panel></>}</Page>
}
function Staff({ user, notify }: { user: Props["user"]; notify: (x: string) => void }) {
  const canEditPermissions=user.role==="Owner"||user.role==="Manager";
  const [rows, setRows] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({ name: "", pin: "", role: "Cashier" }),[editing,setEditing]=useState<any>();
  const load = () =>
    getStaff()
      .then(setRows)
      .catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await createStaff(form);
      await load();
      setOpen(false);
      notify("Staff account created");
    } catch (e) {
      notify(e instanceof Error?e.message:"Staff account could not be created");
    }
  }
  async function saveEdit(e:FormEvent){e.preventDefault();if(!canEditPermissions)return;try{if(user.role==="Owner")await updateStaff(editing.id,{name:editing.name,role:editing.role,active:editing.active,newPin:editing.newPin||null,reason:editing.reason});await updateStaffPermissions(editing.id,editing.permissions||[],editing.reason);setEditing(undefined);await load();notify("Staff access updated and audited")}catch(e){notify(e instanceof Error?e.message:"Staff access could not be updated")}}
  return (
    <Page>
      <Intro
        title="Staff & user roles"
        text="Assign least-privilege roles and review performance."
        action="＋ Add staff"
        onAction={() => setOpen(!open)}
      />
      {open && (
        <Panel title="Add staff">
          <form className="inline-form" onSubmit={save}>
            <Field label="Full name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Private PIN">
              <input
                type="password"
                minLength={6}
                required
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {["Cashier", "Storekeeper", "Manager", "Auditor", "Owner"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </Field>
            <button>Create user</button>
          </form>
        </Panel>
      )}
      <div className="role-cards">
        {[
          ["Owner", "Full access"],
          ["Manager", "Reports · discounts · shifts"],
          ["Cashier", "Sales · customers"],
          ["Storekeeper", "Stock · suppliers"],
        ].map((x) => (
          <article key={x[0]}>
            <b>{x[0]}</b>
            <small>{x[1]}</small>
          </article>
        ))}
      </div>
      <Panel title="Team & access"><Table heads={["Name","Role","Discount","Stock","Reports","Status","Action"]} rows={rows.map(x=>{const assigned=typeof x.permissions==="string"?x.permissions.split(",").filter(Boolean):[];return [x.name,x.role,x.role==="Owner"||x.role==="Manager"||assigned.includes("approvals")?"Yes":"No",x.role==="Owner"||x.role==="Storekeeper"||assigned.includes("inventory")?"Yes":"No",x.role==="Owner"||x.role==="Manager"||assigned.includes("reports")?"Yes":"No",x.active?"Active":"Inactive",canEditPermissions?<button key={`staff-${x.id}`} className="table-action" onClick={()=>setEditing({...x,permissions:assigned,newPin:"",reason:""})}>Edit</button>:"View"]})}/></Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit staff access</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Name"><input required disabled={user.role!=="Owner"} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Role"><select disabled={user.role!=="Owner"} value={editing.role} onChange={e=>setEditing({...editing,role:e.target.value})}>{["Cashier","Storekeeper","Manager","Auditor","Owner"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="New PIN (optional)"><input disabled={user.role!=="Owner"} type="password" minLength={6} value={editing.newPin} onChange={e=>setEditing({...editing,newPin:e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><fieldset><legend>Additional capabilities</legend>{[["reports","Reports"],["approvals","Bill approvals"],["accounting","Accounting"],["audit","Audit trail"],["expenses","Expenses"],["inventory","Inventory"],["staff","Staff administration"],["settings","Settings"]].map(([key,label])=><label key={key}><input type="checkbox" checked={(editing.permissions||[]).includes(key)} onChange={e=>setEditing({...editing,permissions:e.target.checked?[...(editing.permissions||[]),key]:(editing.permissions||[]).filter((x:string)=>x!==key)})}/>{label}</label>)}</fieldset><label><input disabled={user.role!=="Owner"} type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to deactivate)</label><button>Save access change</button></form></section></div>}
    </Page>
  );
}
function ItemSetup({ products,user,notify }: {products:Product[];user:{role:string;isDemo?:boolean}; notify: (x: string) => void }) {
  const industry=profileFor(cachedOrganizationSettings().industryProfile),defaultCategory=industry.itemCategories[0];
  const [editing,setEditing]=useState<any>();
  const [deleteCandidate,setDeleteCandidate]=useState<Product|null>(null),[deleteReason,setDeleteReason]=useState("");
  const [bulkRows,setBulkRows]=useState<any[]>([]),[bulkErrors,setBulkErrors]=useState<{row:number;errors:string[]}[]>([]),[duplicatePolicy,setDuplicatePolicy]=useState("Skip"),[importing,setImporting]=useState(false),[bulkResult,setBulkResult]=useState<any>();
  const [importBatches,setImportBatches]=useState<any[]>([]);const loadBatches=()=>getProductImportBatches().then(setImportBatches).catch(()=>setImportBatches([]));useEffect(()=>{void loadBatches()},[]);
  const historicalJobKey=`thebarcode_historical_job_${user.isDemo?"demo":"live"}`;
  const [historicalRows,setHistoricalRows]=useState<any[]>([]),[historicalErrors,setHistoricalErrors]=useState<string[]>([]),[historicalBusy,setHistoricalBusy]=useState(false);
  const [historicalJobId,setHistoricalJobId]=useState(()=>sessionStorage.getItem(historicalJobKey)||"");
  const [historicalJob,setHistoricalJob]=useState<any>();
  useEffect(()=>{if(!historicalJobId)return;let active=true;let polling=false;const check=async()=>{if(polling||document.visibilityState!=="visible")return;polling=true;try{const job=await getBackgroundJob(historicalJobId);if(!active)return;setHistoricalJob(job);if(job.status==="Completed"){sessionStorage.removeItem(historicalJobKey);setHistoricalJobId("");setHistoricalRows([]);await bootstrap();notify(`Historical import complete · ${job.completedCount} sales created`)}else if(job.status==="Cancelled"){sessionStorage.removeItem(historicalJobKey);setHistoricalJobId("");notify("Historical import cancelled before posting")}}catch(e){if(active)notify(e instanceof Error?e.message:"Could not read import status")}finally{polling=false}};void check();const timer=window.setInterval(()=>{if(historicalJob?.status!=="Failed")void check()},1500);return()=>{active=false;clearInterval(timer)}},[historicalJobId,historicalJob?.status]);
  async function chooseHistoricalFile(file?:File){if(!file)return;const parsed=parseHistoricalCsv(await file.text());const records=parsed.length&&parsed[0].cells[0]?.toLowerCase()==="date"?parsed.slice(1):parsed;const rows=records.map(({cells,rowNumber})=>{const [date,barcode,productName,quantity,unitPrice,paymentMethod,customerName]=cells.map(x=>x.trim());return {rowNumber,date,barcode,productName,quantity:Number(quantity),unitPrice:Number(unitPrice),paymentMethod,customerName}});const errors=rows.flatMap(x=>[!/^\d{4}-\d{2}-\d{2}$/.test(x.date)?`Row ${x.rowNumber}: date must be YYYY-MM-DD`:"",!x.barcode&&!x.productName?`Row ${x.rowNumber}: barcode or product name required`:"",!Number.isInteger(x.quantity)||x.quantity<=0?`Row ${x.rowNumber}: quantity must be a positive whole number`:"",x.unitPrice<0||Number.isNaN(x.unitPrice)?`Row ${x.rowNumber}: valid unit price required`:""]).filter(Boolean);if(rows.length>5000)errors.push("Import at most 5,000 rows at once");setHistoricalRows(rows);setHistoricalErrors(errors);notify(errors.length?`${errors.length} historical rows need correction`:`${rows.length} historical rows ready to import`)}
  async function importHistorical(){if(historicalErrors.length||!historicalRows.length||historicalJobId)return;setHistoricalBusy(true);try{const job=await importHistoricalSales({deviceId:localStorage.getItem("device_id")||"historical-import",rows:historicalRows});sessionStorage.setItem(historicalJobKey,job.id);setHistoricalJob(job);setHistoricalJobId(job.id);notify(`Historical import queued · ${historicalRows.length} rows. You can continue using the app.`)}catch(e){notify(e instanceof Error?e.message:"Historical sales import could not be queued")}finally{setHistoricalBusy(false)}}
  async function retryHistorical(){if(!historicalJobId)return;try{const job=await retryBackgroundJob(historicalJobId);setHistoricalJob(job);notify("Historical import retry queued")}catch(e){notify(e instanceof Error?e.message:"Import retry failed")}}
  async function cancelHistorical(){if(!historicalJobId)return;try{await cancelBackgroundJob(historicalJobId);sessionStorage.removeItem(historicalJobKey);setHistoricalJobId("");setHistoricalJob({status:"Cancelled",stage:"Cancelled"});notify("Historical import cancelled before posting")}catch(e){notify(e instanceof Error?e.message:"Import cannot be cancelled after posting begins")}}
  const [form, setForm] = useState({
    name: "",
    category: defaultCategory,
    barcode: "",
    unit: "item",
    packageQuantity: 1,
    packageUnit: "item",
    trackingMode: "Discrete",
    itemType: "Product",
    brand: "",
    supplier: "",
    taxRate: 0,
    costPrice: 0,
    sellingPrice: 0,
    stock: 0,
    minStock: 0,
    sellable: true,
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    if (Number(form.stock) > 0 && Number(form.costPrice) <= 0) {
      notify("Initial cost price is required when opening stock is provided");
      return;
    }
    try {
      const p:any={id:crypto.randomUUID(),...form,active:true,isDemo:Boolean(user.isDemo)};
      await queueProduct(p);
      await syncOutbox().catch(()=>0);
      const pending=await db.outbox.filter(row=>row.type==='product-create'&&row.payload?.id===p.id).first();
      setForm({name:"",category:defaultCategory,barcode:"",unit:"item",packageQuantity:1,packageUnit:"item",trackingMode:"Discrete",itemType:"Product",brand:"",supplier:"",taxRate:0,costPrice:0,sellingPrice:0,stock:0,minStock:0,sellable:true});dispatchEvent(new Event("dukora:attention"));notify(pending?pending.lastError?`Item saved locally, but the local server rejected it: ${pending.lastError}. Edit the item to correct it.`:"Item saved locally and waiting for the local server.":"Item created in the local database.");
    } catch (e) {
      notify(e instanceof Error?e.message:"Item could not be created");
    }
  }
  async function saveEdit(e:FormEvent){e.preventDefault();try{await queueProduct({...editing,isDemo:Boolean(user.isDemo)},true);await syncOutbox().catch(()=>0);const pending=await db.outbox.filter(row=>(row.type==='product-create'||row.type==='product-update')&&row.payload?.id===editing.id).first();setEditing(undefined);dispatchEvent(new Event("dukora:attention"));notify(pending?pending.lastError?`Item changed locally, but the local server rejected it: ${pending.lastError}. Edit it to correct the entry.`:"Item change saved locally and waiting for the local server.":"Item updated in the local database.")}catch(e){notify(e instanceof Error?e.message:"Item changes could not be saved")}}
  async function removeItem(){if(!deleteCandidate||!deleteReason.trim())return;try{await deleteProduct(deleteCandidate.id,deleteReason.trim());setDeleteCandidate(null);setDeleteReason("");await bootstrap();dispatchEvent(new Event("dukora:attention"));notify("Unused item permanently deleted and audited")}catch(e){notify(e instanceof Error?e.message:"Item could not be deleted; archive it if it has stock or history")}}
  async function chooseBulkFile(file?:File){if(!file)return;try{const rows=parseProductCsv(await file.text());const errors=validateProductRows(rows);setBulkRows(rows);setBulkErrors(errors);setBulkResult(undefined);notify(errors.length?`${errors.length} rows require correction`:`${rows.length} valid rows ready to import`)}catch(e){setBulkRows([]);setBulkErrors([{row:1,errors:[e instanceof Error?e.message:"The CSV could not be read"]}])}}
  async function importBulk(){if(!bulkRows.length||bulkErrors.length)return;setImporting(true);try{const result=await bulkImportProducts({duplicatePolicy,deviceId:localStorage.getItem("device_id")||"local-terminal",rows:bulkRows});setBulkResult(result);await bootstrap();await loadBatches();dispatchEvent(new Event("dukora:attention"));notify(`Import complete · ${result.created} created · ${result.updated} updated · ${result.skipped} skipped`)}catch(e){notify(e instanceof Error?e.message:"Import failed without changing inventory")}finally{setImporting(false)}}
  async function reverseBatch(id:string){if(!confirm("Reverse this import? TheBarcode will refuse if any later sale, stock movement or controlled edit depends on it."))return;try{await reverseProductImport(id);await bootstrap();await loadBatches();dispatchEvent(new Event("dukora:attention"));notify("Bulk import safely reversed and audited")}catch(e){notify(e instanceof Error?e.message:"This batch cannot be reversed")}}
  return (
    <Page>
      {deleteCandidate&&<div className="modal record-editor"><section><button className="close" onClick={()=>setDeleteCandidate(null)}>×</button><h2>Delete unused item</h2><p>This permanent delete is allowed only when the item has no stock or linked sales, movements, recipes, purchases or production history. Items with history must be archived.</p><Field label="Reason for deletion"><input autoFocus required value={deleteReason} onChange={e=>setDeleteReason(e.target.value)}/></Field><div className="button-row"><button className="danger-action" disabled={!deleteReason.trim()} onClick={()=>void removeItem()}>Delete permanently</button><button className="secondary-button" onClick={()=>setDeleteCandidate(null)}>Keep item</button></div></section></div>}
      <Intro
        title="Item setup"
        text={`Add anything sold, stocked or consumed by this ${industry.name.toLowerCase()} business. Suggested categories adapt to the selected industry.`}
      />
      <Two>
        <Panel title="New item">
          <form className="item-form" onSubmit={save}>
            <Field label="Item name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {industry.itemCategories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Item type" help="Product = sellable or finished output. Ingredient = recipe input. Add-on = sellable extra grouped on customer receipts."><select title="Products can be sold and selected as recipe outputs. Ingredients are consumed by recipes. Add-ons are sold with a parent product and grouped on customer receipts." value={form.itemType} onChange={e=>setForm({...form,itemType:e.target.value,sellable:e.target.value==="Ingredient"?false:form.sellable})}><option value="Product">Product · sellable/output</option><option value="Ingredient">Ingredient · recipe input</option><option value="AddOn">Add-on · grouped extra</option></select></Field>
            <Field label="Barcode / SKU">
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </Field>
            <Field label="Unit or serving" help="The base unit used for stock counts, recipe quantities and costing: item, bottle, kg, g, litre, ml, serving, and so on."><select title="How stock is counted for this item: bottle, piece, kg, litre, serving, and so on." value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{inventoryUnits.map(x=><option key={x}>{x}</option>)}</select></Field>
            <Field label="Package size" help="How much is inside one purchased package. Enter the number and its unit together, for example 500 ml or 1 kg; this is not the number of packages in stock."><div className="button-row"><input title="Quantity contained in one package, for example 500 ml or 1 kg. This is separate from the number of packages in stock." type="number" min=".001" step=".001" value={form.packageQuantity} onChange={e=>setForm({...form,packageQuantity:+e.target.value})}/><select title="Measurement inside one package, such as ml, L, g or kg." value={form.packageUnit} onChange={e=>setForm({...form,packageUnit:e.target.value})}>{measureUnits.map(x=><option key={x}>{x}</option>)}</select></div></Field>
            <Field label="Stock tracking" help="Discrete accepts whole units such as 4 bottles. Measured allows decimals such as 0.5 kg or 250 ml."><select title="Discrete means whole units; Measured allows quantities such as 0.5 kg or 250 ml." value={form.trackingMode} onChange={e=>setForm({...form,trackingMode:e.target.value})}><option>Discrete</option><option>Measured</option></select></Field>
            <Field label="Brand"><input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></Field>
            <Field label="Supplier"><input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></Field>
            <Field label="Tax rate %" help="Tax applied to sales of this item, if your business profile requires it. Use 0 when tax is not applicable."><input type="number" min="0" max="100" step=".01" value={form.taxRate} onChange={e=>setForm({...form,taxRate:+e.target.value})}/></Field>
            <Field label={form.stock>0?"Cost price · required for opening stock":"Cost price"} help="Cost per base stock unit. It drives opening inventory value, recipe cost, cost of goods sold and accounting entries.">
              <input
                type="number"
                min="0"
                step="0.01"
                required={form.stock>0}
                value={form.costPrice}
                onChange={(e) =>
                  setForm({ ...form, costPrice: +e.target.value })
                }
              />
            </Field>
            <Field label="Selling price" help="Customer price per base stock unit before any configured tax or discount.">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) =>
                  setForm({ ...form, sellingPrice: +e.target.value })
                }
              />
            </Field>
            <Field label="Opening stock" help="Quantity already on hand when this item is first created. Any quantity above zero must have a positive initial cost price.">
              <input
                type="number"
                min="0"
                step={form.trackingMode==="Discrete"?"1":"0.001"}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: +e.target.value })}
              />
            </Field>
            <Field label="Minimum stock" help="Reorder threshold in the same base unit. Low-stock notifications appear when available stock reaches this level.">
              <input
                type="number"
                min="0"
                step={form.trackingMode==="Discrete"?"1":"0.001"}
                value={form.minStock}
                onChange={(e) =>
                  setForm({ ...form, minStock: +e.target.value })
                }
              />
            </Field>
            <div className="checks">
              <label>
                <input
                  type="checkbox"
                  checked={form.sellable}
                  onChange={(e) =>
                    setForm({ ...form, sellable: e.target.checked })
                  }
                />{" "}
                Sellable on POS
              </label>
              <label>
                <input type="checkbox" /> Kitchen consumable
              </label>
              <label>
                <input type="checkbox" defaultChecked /> Active
              </label>
            </div>
            <button className="save-item">Save item</button>
          </form>
        </Panel>
        <Panel title={`${industry.name} category guide`}>
          <div className="category-guide">
            {industry.itemCategories.map((name) => (
              <p key={name}>
                <i>{name.slice(0,1).toUpperCase()}</i>
                <span>
                  <b>{name}</b>
                  <small>Suggested for {industry.name.toLowerCase()}</small>
                </span>
              </p>
            ))}
          </div>
        </Panel>
      </Two>
      <Panel title="Bulk item upload · Excel-compatible CSV">
        <div className="export-card"><i>⇧</i><p>Download the controlled template, add up to 5,000 variants, then upload it for row-by-row validation. Separate sizes such as 500 ml and 1 L remain separate stock records.</p><button onClick={downloadProductTemplate}>⇩ Download item template</button><button className="secondary-button" onClick={downloadHistoricalSalesTemplate}>⇩ Download historical sales template</button><label className="outline-button">Choose completed CSV<input hidden type="file" accept=".csv,text/csv" onChange={e=>void chooseBulkFile(e.target.files?.[0])}/></label></div>
        {bulkRows.length>0&&<><div className="kpi-strip"><span><small>Rows</small><b>{bulkRows.length}</b></span><span><small>Valid</small><b>{bulkRows.length-bulkErrors.length}</b></span><span><small>Needs correction</small><b>{bulkErrors.length}</b></span></div><Filter><label>When an item/SKU already exists</label><select value={duplicatePolicy} onChange={e=>setDuplicatePolicy(e.target.value)}><option value="Skip">Skip existing</option><option value="Update">Update details only</option><option value="AddStock">Update details and add opening stock</option></select><button disabled={bulkErrors.length>0||importing} onClick={importBulk}>{importing?"Importing…":"Import validated rows"}</button></Filter>
        {bulkErrors.length>0&&<Panel title="Corrections required"><Table heads={["CSV row","Validation issue"]} rows={bulkErrors.map(x=>[String(x.row),x.errors.join("; ")])}/></Panel>}
        <Table heads={["Row","Item variant","SKU","Stock unit","Package size","Tracking","Opening stock","Cost","Price"]} rowClasses={bulkRows.slice(0,100).map(x=>bulkErrors.some(e=>e.row===x.rowNumber)?"debt":"")} rows={bulkRows.slice(0,100).map(x=>[x.rowNumber,`${x.name} · ${x.category}`,x.barcode||"—",x.stockUnit,`${x.packageQuantity} ${x.packageUnit}`,x.trackingMode,x.openingStock,money(x.costPrice),money(x.sellingPrice)])}/>{bulkRows.length>100&&<p className="muted">Preview shows the first 100 rows. All {bulkRows.length} rows will be validated and imported.</p>}{bulkResult&&<p className="insight-summary">Batch {bulkResult.batchId}: {bulkResult.created} created, {bulkResult.updated} updated, {bulkResult.stockAdded} stock additions and {bulkResult.skipped} skipped.</p>}</>}
      </Panel>
      <Panel title="Recent import batches"><Table heads={["Imported","Rows","Policy","Created","Updated","Skipped","Status","Action"]} rows={importBatches.map(x=>[new Date(x.createdAt).toLocaleString(),String(x.totalRows),x.duplicatePolicy,String(x.createdCount),String(x.updatedCount),String(x.skippedCount),x.status,x.status==="Completed"&&["Owner","Manager"].includes(user.role)?<button key={`reverse-${x.id}`} className="table-action" onClick={()=>void reverseBatch(x.id)}>Reverse safely</button>:"—"])}/></Panel>
      <Panel title="Historical sales upload · Excel-compatible CSV"><p className="muted">Columns: date, barcode, product name, quantity, unit price, payment method, customer name. Dates must be YYYY-MM-DD. The import is all-or-nothing; progress survives navigation and a restart.</p><label className="outline-button">Choose historical sales CSV<input hidden type="file" accept=".csv,text/csv" onChange={e=>void chooseHistoricalFile(e.target.files?.[0])}/></label>{historicalRows.length>0&&<><div className="kpi-strip"><span><small>Rows</small><b>{historicalRows.length}</b></span><span><small>Errors</small><b>{historicalErrors.length}</b></span></div>{historicalErrors.length>0&&<Panel title="Corrections required"><p>{historicalErrors.join(" · ")}</p></Panel>}<button type="button" disabled={historicalBusy||historicalErrors.length>0||Boolean(historicalJobId)} onClick={()=>void importHistorical()}>{historicalBusy?"Queuing…":"Import historical sales"}</button></>}{historicalJob&&<div className="background-job-status" role="status"><b>Import {historicalJob.status}</b><span>{historicalJob.stage} · {historicalJob.completedCount} of {historicalJob.totalCount} prepared{historicalJob.status==="Running"?"; not committed until all rows pass":""}</span>{historicalJob.error&&<span className="accounting-negative">{historicalJob.error}</span>}{historicalJob.status==="Failed"&&<button type="button" className="secondary-button" onClick={()=>void retryHistorical()}>Retry failed import</button>}{historicalJob.status==="Queued"&&<button type="button" className="secondary-button" onClick={()=>void cancelHistorical()}>Cancel queued import</button>}</div>}</Panel>
      <Panel title="All items · edit or archive">
        <Table heads={["Item","Variant","Category","Stock","Cost","Price","POS","Status","Action"]} rows={products.map(x=>[x.name,`${x.packageQuantity||1} ${x.packageUnit||x.unit}`,x.category,`${x.stock} ${x.unit}`,money(x.costPrice),money(x.sellingPrice),x.sellable?"Yes":"No",x.active?"Active":"Archived",<span className="button-row" key={`product-${x.id}`}><button className="table-action" onClick={()=>setEditing({...x,packageQuantity:x.packageQuantity||1,packageUnit:x.packageUnit||x.unit,trackingMode:x.trackingMode||"Discrete",taxRate:x.taxRate||0,reason:""})}>Edit</button><button className="table-action danger-action" onClick={()=>{setDeleteCandidate(x);setDeleteReason("")}}>Delete</button></span>])}/>
      </Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit item</h2><form className="item-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Category"><input required value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></Field><Field label="Item type" help="Product = sellable or finished output. Ingredient = material consumed by a recipe and excluded from sales/output choices."><select title="Products are sellable/output items. Ingredients are recipe inputs and are never shown as sale/output choices." value={editing.itemType||"Product"} onChange={e=>setEditing({...editing,itemType:e.target.value,sellable:e.target.value==="Ingredient"?false:editing.sellable})}><option value="Product">Product · sellable/output</option><option value="Ingredient">Ingredient · recipe input</option></select></Field><Field label="Brand"><input value={editing.brand||""} onChange={e=>setEditing({...editing,brand:e.target.value})}/></Field><Field label="Barcode / SKU"><input value={editing.barcode||""} onChange={e=>setEditing({...editing,barcode:e.target.value})}/></Field><Field label="Stock unit" help="The base unit used for inventory counts, recipe quantities and costing."><select value={editing.unit} onChange={e=>setEditing({...editing,unit:e.target.value})}>{inventoryUnits.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Package size" help="Quantity and unit inside one purchased package, such as 500 ml or 1 kg."><div className="button-row"><input type="number" min=".001" step=".001" value={editing.packageQuantity} onChange={e=>setEditing({...editing,packageQuantity:+e.target.value})}/><select value={editing.packageUnit} onChange={e=>setEditing({...editing,packageUnit:e.target.value})}>{measureUnits.map(x=><option key={x}>{x}</option>)}</select></div></Field><Field label="Tracking" help="Discrete means whole units; Measured allows decimal quantities such as 0.5 kg or 250 ml."><select value={editing.trackingMode} onChange={e=>setEditing({...editing,trackingMode:e.target.value})}><option>Discrete</option><option>Measured</option></select></Field><Field label="Supplier"><input value={editing.supplier||""} onChange={e=>setEditing({...editing,supplier:e.target.value})}/></Field><Field label="Tax rate %"><input type="number" min="0" max="100" step=".01" value={editing.taxRate} onChange={e=>setEditing({...editing,taxRate:+e.target.value})}/></Field><Field label="Cost price" help="Cost per base stock unit; used by opening value, recipe cost, cost of goods sold and accounting."><input type="number" min="0" step=".01" value={editing.costPrice} onChange={e=>setEditing({...editing,costPrice:+e.target.value})}/></Field><Field label="Selling price"><input type="number" min="0" step=".01" value={editing.sellingPrice} onChange={e=>setEditing({...editing,sellingPrice:+e.target.value})}/></Field><Field label="Minimum stock" help="Reorder threshold in the same base unit; low-stock notices use this value."><input type="number" min="0" step={editing.trackingMode==="Measured"?".001":"1"} value={editing.minStock} onChange={e=>setEditing({...editing,minStock:+e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><div className="checks"><label><input type="checkbox" checked={editing.sellable} onChange={e=>setEditing({...editing,sellable:e.target.checked})}/> Sellable</label><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label></div><button>Save controlled change</button></form></section></div>}
    </Page>
  );
}
function parseHistoricalCsv(text:string):{rowNumber:number;cells:string[]}[]{
  const rows:{rowNumber:number;cells:string[]}[]=[];let cells:string[]=[],field="",quoted=false,line=1,recordLine=1;
  const push=()=>{cells.push(field);if(cells.some(x=>x.trim()))rows.push({rowNumber:recordLine,cells});cells=[];field="";recordLine=line};
  const source=text.replace(/^\uFEFF/,"");
  for(let i=0;i<source.length;i++){const char=source[i];if(char==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++}else quoted=!quoted;continue}if(char===","&&!quoted){cells.push(field);field="";continue}if((char==="\n"||char==="\r")&&!quoted){if(char==="\r"&&source[i+1]==="\n")i++;line++;push();continue}if(char==="\n")line++;field+=char}
  if(field||cells.length)push();return rows;
}
function downloadHistoricalSalesTemplate(){
  const rows=[
    ["date","barcode","product_name","quantity","unit_price","payment_method","customer_name"],
    ["2026-01-15","WATER-500","Mineral Water 500ml",2,80,"Cash","Walk-in customer"],
    ["2026-01-15","CAKE-1KG","Berry Cake 1kg",1,1800,"M-Pesa","Demo Customer"]
  ];
  const blob=new Blob(["\ufeff"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="TheBarcode-historical-sales-template.csv";a.click();URL.revokeObjectURL(url)
}
function groupReleaseNotes(notes:string[]){
  const groups=[
    {title:"Interface & accessibility",test:/settings|grid|interface|theme|navigation|font|display|dialog|toast|mobile|cards|login|empty state|icon|popover/i,notes:[] as string[]},
    {title:"Sales, bills & customers",test:/bill|sale|receipt|customer|payment|credit|refund|cash|m-pesa|collection/i,notes:[] as string[]},
    {title:"Inventory & production",test:/stock|inventory|item|product|ingredient|production|bulk|supplier|quantity|variant/i,notes:[] as string[]},
    {title:"Reports, expenses & intelligence",test:/report|insight|dashboard|analytics|expense|profit|revenue/i,notes:[] as string[]},
    {title:"Deployment, printing & connectivity",test:/windows|desktop|installer|webview|printer|docker|offline|sync|update|terminal|device|hosted|api/i,notes:[] as string[]},
    {title:"Administration & data protection",test:/staff|role|owner|backup|purge|audit|demo|approval|authorization|data isolation|governance/i,notes:[] as string[]},
    {title:"Platform & business setup",test:/.*/,notes:[] as string[]},
  ];
  notes.forEach(note=>(groups.find(group=>group.test.test(note))||groups.at(-1)!).notes.push(note));
  return groups.filter(group=>group.notes.length);
}
function Settings({
  user,
  notify,
}: {
  user: Props["user"];
  notify: (x: string) => void;
}) {
  // Publishing reference only; users are not shown this folder URL. Drive
  // folder pages are not manifests, so a direct shared latest.json URL is the
  // supported mirror format.
  const driveReleaseFolder="https://drive.google.com/drive/folders/1IzlVfcc9nDLh_mdpndCANs1ThsKDHLS9?authuser=0";
  const [theme, setTheme] = useState(localStorage.getItem("theme") ?? "Forest");
  const [settingsTab,setSettingsTab]=useState(sessionStorage.getItem("dukora_settings_tab")||"appearance");
  const [navigationLayout,setNavigationLayout]=useState(localStorage.getItem("navigation_layout")??"Vertical");
  const [displayScale, setDisplayScale] = useState<DisplayScaleName>(storedDisplayScale());
  const [lockDurationMinutes,setLockDurationMinutes]=useState(()=>{const value=Number(localStorage.getItem("lock_timeout_minutes"));return Number.isFinite(value)&&value>=1&&value<=240?value:10});
  const [securityActivity,setSecurityActivity]=useState(getSecurityActivity);
  useEffect(()=>{const refresh=()=>setSecurityActivity(getSecurityActivity());addEventListener("thebarcode:security-activity",refresh);return()=>removeEventListener("thebarcode:security-activity",refresh)},[]);
  const [organization,setOrganization]=useState<OrganizationSettings>(defaultOrganizationSettings);
  const [registrationPlans,setRegistrationPlans]=useState<any[]>([]);
  const [registration,setRegistration]=useState<any>({planCode:"OpenPreview",billingStatus:"Trial",deploymentMode:"Local",branchLimit:99,terminalLimit:99,userLimit:99,trialEndsAt:"",enabledModules:"sales,inventory,expenses,reports,ai,production,accounting"});
  const selectedIndustry=profileFor(organization.industryProfile||(organization as any).IndustryProfile),selectedModules=enabledModules(organization.enabledModules||(organization as any).EnabledModules),activePlan=registrationPlans.find(x=>x.code===registration.planCode),moduleAllowed=(key:string)=>registration.planCode==="OpenPreview"||!registrationPlans.length||activePlan?.modules?.includes(key);
  const releaseGroups=groupReleaseNotes(RELEASE_NOTES);
  const [receiptConfig,setReceiptConfig]=useState<ReceiptSettings>(defaultReceiptSettings);
  const [branches,setBranches]=useState<any[]>([]),[terminals,setTerminals]=useState<any[]>([]);
  const [branchForm,setBranchForm]=useState({name:"",code:"",address:"",phone:"",active:true});
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState(localStorage.getItem("receipt_printer") || "");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [printerScanError,setPrinterScanError]=useState("");
  const [printerQueue, setPrinterQueue] = useState<string[]>([]);
  const [deviceName, setDeviceName] = useState(localStorage.getItem("device_id") || `POS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`);
  const [terminalName,setTerminalName]=useState(localStorage.getItem("terminal_name")||"Front counter");
  const [branchId,setBranchId]=useState(localStorage.getItem("branch_id")||"");
  const [apiUrl, setApiUrl] = useState(localStorage.getItem("api_url") || "/api");
  const [updateUrl, setUpdateUrl] = useState(()=>{const saved=localStorage.getItem("update_manifest_url")||"";return saved.toLowerCase().startsWith("https://drive.google.com/drive/folders/1izlvfcc9ndlh_md")?GITHUB_UPDATE_MANIFEST:(saved||GITHUB_UPDATE_MANIFEST)});
  const [updateBusy,setUpdateBusy]=useState(false);
  const [insightsConfig,setInsightsConfig]=useState({enabled:false,endpoint:"https://api.openai.com/v1/chat/completions",model:"gpt-5-mini",apiKey:"",apiKeyConfigured:false,clearApiKey:false,allowUserNames:false});
  const [backups,setBackups]=useState<any[]>([]),[purgeConfirmation,setPurgeConfirmation]=useState(""),[purgeReason,setPurgeReason]=useState(""),[maintenanceBusy,setMaintenanceBusy]=useState(false);
  const [backupJobId,setBackupJobId]=useState(()=>sessionStorage.getItem("thebarcode_backup_job")||"");
  const [backupJob,setBackupJob]=useState<any>();
  async function refreshPrinters(){
    let lastError:unknown;
    for(let attempt=0;attempt<4;attempt++){
      try{
        const items=await listSilentPrinters();
        setPrinters(items);setBridgeReady(true);setPrinterScanError("");
        if(!localStorage.getItem("receipt_printer")&&items.length===1)setPrinter(items[0]);
        return;
      }catch(error){lastError=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)))}
    }
    setPrinters([]);setBridgeReady(false);
    setPrinterScanError(lastError instanceof Error?lastError.message:"The printer service could not be reached");
  }
  useEffect(()=>{if(!backupJobId||user.role!=="Owner")return;let active=true;let polling=false;const check=async()=>{if(polling||document.visibilityState!=="visible")return;polling=true;try{const job=await getBackgroundJob(backupJobId);if(!active)return;setBackupJob(job);if(job.status==="Completed"){sessionStorage.removeItem("thebarcode_backup_job");setBackupJobId("");setBackups(await getMaintenanceBackups());notify("Local database backup completed and verified")}else if(job.status==="Cancelled"){sessionStorage.removeItem("thebarcode_backup_job");setBackupJobId("")}}catch(e){if(active)notify(e instanceof Error?e.message:"Could not read backup status")}finally{polling=false}};void check();const timer=window.setInterval(()=>{if(backupJob?.status!=="Failed")void check()},1500);return()=>{active=false;clearInterval(timer)}},[backupJobId,backupJob?.status,user.role]);
  useEffect(() => {
    getSettings().then((data)=>{setOrganization(data.organization);setRegistration((current:any)=>({...current,...data.organization,planCode:data.organization.planCode||"OpenPreview",enabledModules:data.organization.enabledModules||current.enabledModules}));setReceiptConfig(data.receipt);setBranches(data.branches);setTerminals(data.terminals);localStorage.setItem("organization_profile",JSON.stringify(data.organization));localStorage.setItem("receipt_configuration",JSON.stringify(data.receipt));if(!branchId&&data.branches.length)setBranchId(data.branches[0].id)}).catch(()=>notify("Shared settings unavailable · using saved terminal configuration"));
    if(user.role==="Owner"){getRegistrationCatalog().then((x:any)=>setRegistrationPlans(x.plans||[])).catch(()=>0);getRegistration().then((x:any)=>{if(x?.organization){setRegistration((current:any)=>({...current,...x.organization,planCode:x.organization.planCode||"OpenPreview",enabledModules:x.organization.enabledModules||current.enabledModules}));setRegistrationPlans(x.plans||[])}}).catch(()=>0)}
    if(["Owner","Manager"].includes(user.role))getInsightsSettings().then(x=>setInsightsConfig(current=>({...current,...x,apiKey:"",clearApiKey:false}))).catch(()=>0);
    if(user.role==="Owner")getMaintenanceBackups().then(setBackups).catch(()=>0);
    void refreshPrinters();
  }, []);
  useEffect(() => { if (!printer || !bridgeReady) { setPrinterQueue([]); return; } const refresh=()=>getPrinterQueue(printer).then(setPrinterQueue).catch(()=>setPrinterQueue([])); void refresh(); const timer=window.setInterval(refresh,8000); return()=>clearInterval(timer); }, [printer, bridgeReady]);
  function choose(x: string) {
    setTheme(x);
    localStorage.setItem("theme", x);
    document.documentElement.dataset.theme = x.toLowerCase();
  }
  function chooseDisplayScale(x: DisplayScaleName) {
    setDisplayScale(x);
    saveDisplayScale(x);
    notify(`${x} display size saved on this terminal`);
  }
  function chooseNavigationLayout(value:string){setNavigationLayout(value);localStorage.setItem("navigation_layout",value);dispatchEvent(new CustomEvent("dukora:navigation-layout",{detail:value}));notify(`${value} navigation saved on this terminal`)}
  function chooseLockDuration(value:number){setLockDurationMinutes(value);localStorage.setItem("lock_timeout_minutes",String(value));dispatchEvent(new CustomEvent("thebarcode:lock-duration",{detail:value}));recordSecurityActivity("Lock timer changed",user.name,`Locks after ${value} minutes of inactivity`);setSecurityActivity(getSecurityActivity());notify(`Session lock set to ${value} minute${value===1?"":"s"} of inactivity`)}
  function saveTerminal() {
    localStorage.setItem("device_id", deviceName);
    localStorage.setItem("api_url", apiUrl);
    const normalizedUpdateUrl=updateUrl.trim().toLowerCase().startsWith("https://drive.google.com/drive/folders/1izlvfcc9ndlh_md")?GITHUB_UPDATE_MANIFEST:(updateUrl.trim()||GITHUB_UPDATE_MANIFEST);
    setUpdateUrl(normalizedUpdateUrl);
    localStorage.setItem("update_manifest_url", normalizedUpdateUrl);
    notify("Terminal connection and update channel saved");
  }
  async function persistOrganization(){try{const saved=await saveOrganization(organization);setOrganization(saved);localStorage.setItem("organization_profile",JSON.stringify(saved));localStorage.setItem("business_name",saved.name);notify("Shared business profile saved")}catch(e){notify(e instanceof Error?e.message:"Business profile could not be saved")}}
  async function persistIndustry(){if(user.role!=="Owner"){notify("Only the Owner can change industry and enabled modules");return}try{const profile=profileFor(organization.industryProfile||(organization as any).IndustryProfile);const category=profile.categories.includes(organization.businessCategory||"")?organization.businessCategory!:profile.categories[0];const saved=await saveIndustryConfiguration({industryProfile:profile.key,businessCategory:category,enabledModules:Array.from(selectedModules)});const normalized={...saved,enabledModules:saved.enabledModules||saved.EnabledModules||Array.from(selectedModules).join(",")};setOrganization(normalized);localStorage.setItem("organization_profile",JSON.stringify(normalized));dispatchEvent(new CustomEvent("dukora:industry-profile",{detail:normalized}));notify("Industry, terminology and enabled modules saved across the institution")}catch(e){notify(e instanceof Error?e.message:"Industry configuration could not be saved")}}
  function choosePlan(planCode:string){const plan=registrationPlans.find(x=>x.code===planCode);const core=["sales","inventory","expenses"];const allowed=new Set((plan?.modules||[]).map((x:string)=>x.toLowerCase()));const next=new Set((registration.enabledModules||"").split(",").map((x:string)=>x.trim().toLowerCase()).filter(Boolean));if(planCode==="OpenPreview"){["sales","inventory","expenses","reports","ai","production","accounting"].forEach(x=>next.add(x))}else{for(const value of Array.from(next))if(!allowed.has(value))next.delete(value);for(const value of core)next.add(value)}setRegistration((current:any)=>({...current,planCode,enabledModules:Array.from(next).join(","),branchLimit:plan?.branchLimit||current.branchLimit,terminalLimit:plan?.terminalLimit||current.terminalLimit,userLimit:plan?.userLimit||current.userLimit}))}
  async function persistRegistration(){try{const profile=profileFor(organization.industryProfile||(organization as any).IndustryProfile);const category=profile.categories.includes(organization.businessCategory||"")?organization.businessCategory!:profile.categories[0];const saved:any=await saveRegistration({...registration,industryProfile:profile.key,businessCategory:category,enabledModules:(registration.enabledModules||"").split(",").filter(Boolean),trialEndsAt:registration.trialEndsAt||null});const normalized={...organization,...saved.organization,enabledModules:saved.organization?.enabledModules||registration.enabledModules,planCode:saved.organization?.planCode||registration.planCode};setOrganization(normalized);setRegistration((current:any)=>({...current,...normalized}));localStorage.setItem("organization_profile",JSON.stringify(normalized));dispatchEvent(new CustomEvent("dukora:industry-profile",{detail:normalized}));notify(`${saved.plan?.name||registration.planCode} package and module access saved`)}catch(e){notify(e instanceof Error?e.message:"Package configuration could not be saved")}}
  async function persistReceipt(){try{const saved=await saveReceiptConfiguration(receiptConfig);setReceiptConfig(saved);localStorage.setItem("receipt_configuration",JSON.stringify(saved));localStorage.setItem("receipt_footer",saved.footer);notify("Shared receipt configuration saved")}catch(e){notify(e instanceof Error?e.message:"Receipt configuration could not be saved")}}
  async function persistInsights(){try{const saved=await saveInsightsSettings(insightsConfig);setInsightsConfig(current=>({...current,...saved,apiKey:"",clearApiKey:false}));notify(saved.enabled&&saved.apiKeyConfigured?"AI insights provider saved and encrypted":"Rule-based Smart Insights remains active")}catch(e){notify(e instanceof Error?e.message:"Owner authorization is required")}}
  async function persistBranch(){try{const saved=await saveBranch(branchForm);const data=await getSettings();setBranches(data.branches);setBranchForm({name:"",code:"",address:"",phone:"",active:true});if(!branchId)setBranchId(saved.id);notify("Branch saved")}catch(e){notify(e instanceof Error?e.message:"Branch could not be saved")}}
  async function persistTerminal(){if(!branchId){notify("Select or create a branch first");return}try{const existing=terminals.find(x=>x.deviceKey===deviceName);const saved=await saveTerminalConfiguration({id:existing?.id,branchId,name:terminalName,deviceKey:deviceName,active:true});localStorage.setItem("device_id",saved.deviceKey);localStorage.setItem("terminal_name",saved.name);localStorage.setItem("branch_id",saved.branchId);localStorage.setItem("branch_name",branches.find(x=>x.id===saved.branchId)?.name||"");setTerminals((await getSettings()).terminals);notify("This terminal is registered to the selected branch")}catch(e){notify(e instanceof Error?e.message:"Terminal registration could not be saved")}}
  async function checkUpdates(silent=false) {
    if (!navigator.onLine) { if(!silent)notify("Update check skipped while offline"); return; }
    setUpdateBusy(true);
    try {
      const manifest=await fetchLatestUpdate(updateUrl);
      if(!manifest)throw new Error("No reachable release manifest with a SHA-256 checksum");
      if (compareVersions(manifest.version,APP_VERSION)<=0) {
        if(!silent)notify(`TheBarcode ${APP_VERSION} is current`);
      } else {
        dispatchEvent(new CustomEvent("thebarcode:update-available",{detail:manifest}));
      }
    } catch { if(!silent)notify("No reachable update manifest was found; checked Beyond Raw Data, GitHub and the configured mirror."); }
    finally{setUpdateBusy(false)}
  }
  async function restore() {
    await resetDemo();
    await bootstrap();
    notify("Demo data restored · PIN 123456");
  }
  async function remove() {
    if (!confirm("Remove only records marked as demo?")) return;
    await removeDemo();
    await removeLocalDemo();
    notify("Demo records removed");
  }
  async function backupNow(){if(backupJobId)return;setMaintenanceBusy(true);try{const job=await createBackgroundBackup();sessionStorage.setItem("thebarcode_backup_job",job.id);setBackupJob(job);setBackupJobId(job.id);notify("Database backup queued; you can continue using the app") }catch(e){notify(e instanceof Error?e.message:"Backup could not be queued")}finally{setMaintenanceBusy(false)}}
  async function retryBackup(){if(!backupJobId)return;try{setBackupJob(await retryBackgroundJob(backupJobId))}catch(e){notify(e instanceof Error?e.message:"Backup retry failed")}}
  async function purgeNow(){if(purgeConfirmation!=="PURGE LIVE DATA")return;setMaintenanceBusy(true);try{const result=await purgeLiveData(purgeConfirmation,purgeReason);await purgeLocalLiveData();await bootstrap();setBackups(await getMaintenanceBackups());setPurgeConfirmation("");setPurgeReason("");notify(`Live records purged after backup ${result.backup.fileName}`);dispatchEvent(new CustomEvent("dukora:attention-refresh"))}catch(e){notify(e instanceof Error?e.message:"Live data could not be purged")}finally{setMaintenanceBusy(false)}}
  function restoreBackup(fileName:string){const desktop=(window as any).chrome?.webview;if(!desktop){notify("Restore is available from the installed TheBarcode desktop app");return}desktop.postMessage({command:"restoreBackup",fileName})}
  const settingsTabs=[{id:"appearance",label:"Appearance"},{id:"security",label:"Security"},{id:"business",label:"Business"},...(user.role==="Owner"?[{id:"plan",label:"Plan & modules"}]:[]),{id:"hardware",label:"Devices & receipts"},...(["Owner","Manager"].includes(user.role)?[{id:"intelligence",label:"Smart Insights"}]:[]),...(user.role==="Owner"?[{id:"data",label:"Data protection"}]:[])];
  const activeSettingsTab=settingsTabs.some(tab=>tab.id===settingsTab)?settingsTab:"appearance";
  function selectSettingsTab(id:string){setSettingsTab(id);sessionStorage.setItem("dukora_settings_tab",id)}
  return (
    <Page>
      <Intro
        title="Device & business settings"
        text="Configure this terminal, printer, themes and offline behaviour."
      />
      <div className="settings-tabs" role="tablist" aria-label="Settings categories">{settingsTabs.map(tab=><button key={tab.id} type="button" role="tab" aria-selected={activeSettingsTab===tab.id} aria-controls={`settings-panel-${tab.id}`} className={activeSettingsTab===tab.id?"active":""} onClick={()=>selectSettingsTab(tab.id)}>{tab.label}</button>)}</div>
      {activeSettingsTab==="appearance"&&<div className="settings-tab-panel" id="settings-panel-appearance" role="tabpanel">
      <Panel title="App theme">
        <div className="theme-grid">
          {[
            ["Forest", "#153d34"],
            ["Ocean", "#165d75"],
            ["Plum", "#5c355f"],
            ["Charcoal", "#30383a"],
          ].map((x) => (
            <button
              className={theme === x[0] ? "active" : ""}
              onClick={() => choose(x[0])}
              key={x[0]}
            >
              <i style={{ background: x[1] }} />
              <b>{x[0]}</b>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Font & interface size">
        <p className="display-scale-help">Change every font proportionally while scaling cards, charts, navigation and touch targets with it. The relative hierarchy is preserved and the choice persists on this terminal.</p>
        <div className="display-scale-grid">
          {(Object.entries(displayScales) as [DisplayScaleName, number][]).map(([name, scale]) => (
            <button className={displayScale === name ? "active" : ""} onClick={() => chooseDisplayScale(name)} key={name} aria-pressed={displayScale === name}>
              <b style={{ fontSize: `${Math.round(18 * scale)}px` }}>Aa</b>
              <span>{name}</span>
              <small>{Math.round(scale * 100)}%</small>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Navigation layout">
        <p className="display-scale-help">Choose a traditional left sidebar or a horizontal top menu. The choice persists on this terminal.</p>
        <div className="navigation-layout-grid">{["Vertical","Horizontal"].map(value=><button className={navigationLayout===value?"active":""} onClick={()=>chooseNavigationLayout(value)} key={value}><b>{value==="Vertical"?"▥":"▤"}</b><span>{value}</span></button>)}</div>
      </Panel>
      </div>}
      {activeSettingsTab==="security"&&<div className="settings-tab-panel" id="settings-panel-security" role="tabpanel">
        <Panel title="Session lock">
          <p className="display-scale-help">Protect this terminal when staff step away. The app locks without signing the current user out, and held bills and offline work stay in place. The default is 10 minutes.</p>
          <div className="security-session-grid"><div><b>{user.name}</b><small>{user.role} · Active session on this terminal</small><small>Last sign-in: {localStorage.getItem("thebarcode_security_last_signin")?new Date(localStorage.getItem("thebarcode_security_last_signin")!).toLocaleString():"Current session"}</small></div><Field label="Lock after inactivity"><select value={lockDurationMinutes} onChange={e=>chooseLockDuration(Number(e.target.value))}>{[1,5,10,15,30,60,120,240].map(value=><option key={value} value={value}>{value} minute{value===1?"":"s"}</option>)}</select></Field><button type="button" className="security-lock-now" onClick={()=>dispatchEvent(new Event("thebarcode:lock-now"))}>Lock this terminal now</button></div>
          <p className="security-protection-note">Repeated incorrect unlock PINs are paused after five attempts. When online, sign-in attempts are also throttled by the local API.</p>
        </Panel>
        {(["Owner","Manager"].includes(user.role))&&<Panel title="Recent security activity · this terminal"><p className="display-scale-help">This list is stored on this device and records sign-ins, lock events, and PIN failures. It never stores PINs.</p><Table heads={["Time","Event","Staff","Details"]} rows={securityActivity.map(item=>[new Date(item.at).toLocaleString(),item.action,item.actor,item.detail||"—"])}/></Panel>}
      </div>}
      {activeSettingsTab==="business"&&<div className="settings-tab-panel" id="settings-panel-business" role="tabpanel"><Two>
        <Panel title="Business profile">
          <div className="settings-fields">
            <Field label="Trading name"><input value={organization.name} onChange={(e)=>setOrganization({...organization,name:e.target.value})}/></Field>
            <Field label="Legal name"><input value={organization.legalName||""} onChange={(e)=>setOrganization({...organization,legalName:e.target.value})}/></Field>
            <Field label="Industry"><select value={organization.industryProfile} onChange={(e)=>{const profile=profileFor(e.target.value);setOrganization({...organization,industryProfile:profile.key,businessCategory:profile.categories[0]})}}>{industryProfiles.map(x=><option key={x.key} value={x.key}>{x.name}</option>)}</select></Field>
            <Field label="Business category"><select value={organization.businessCategory||selectedIndustry.categories[0]} onChange={e=>setOrganization({...organization,businessCategory:e.target.value})}>{selectedIndustry.categories.map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></Field>
            <div className="module-selector"><b>Enabled operational modules</b><small>Core sales, inventory and expenses remain enabled for data integrity. Optional modules follow the selected package.</small>{[{key:"sales",name:"Sales & POS",locked:true},{key:"inventory",name:"Inventory",locked:true},{key:"expenses",name:"Expenses",locked:true},{key:"production",name:selectedIndustry.productionLabel},{key:"reports",name:"Reports"},{key:"ai",name:"Smart Insights"},{key:"accounting",name:"Accounting"}].map(m=>{const allowed=moduleAllowed(m.key);return <label key={m.key}><input type="checkbox" disabled={m.locked||!allowed} checked={selectedModules.has(m.key)} onChange={e=>{const next=new Set(selectedModules);e.target.checked?next.add(m.key):next.delete(m.key);setOrganization({...organization,enabledModules:Array.from(next).join(',')})}}/> {m.name}{!allowed&&<small> · package upgrade required</small>}</label>})}</div>
            <div className="industry-preview"><b>Industry terminology</b><small>{selectedIndustry.inputLabel} · {selectedIndustry.productionHelp}</small></div>
            <button className="outline-button" onClick={persistIndustry}>Save industry & modules</button>
            <Field label="Currency"><select value={organization.currency} onChange={(e)=>setOrganization({...organization,currency:e.target.value})}><option>KES</option><option>USD</option><option>UGX</option><option>TZS</option></select></Field>
            <Field label="Tagline"><input value={organization.tagline||""} onChange={(e)=>setOrganization({...organization,tagline:e.target.value})}/></Field>
            <Field label="Phone"><input value={organization.phone||""} onChange={(e)=>setOrganization({...organization,phone:e.target.value})}/></Field>
            <Field label="Email"><input type="email" value={organization.email||""} onChange={(e)=>setOrganization({...organization,email:e.target.value})}/></Field>
            <Field label="Address"><input value={organization.address||""} onChange={(e)=>setOrganization({...organization,address:e.target.value})}/></Field>
            <Field label="Tax PIN"><input value={organization.taxPin||""} onChange={(e)=>setOrganization({...organization,taxPin:e.target.value})}/></Field>
            <Field label="VAT number"><input value={organization.vatNumber||""} onChange={(e)=>setOrganization({...organization,vatNumber:e.target.value})}/></Field>
            <button className="outline-button" onClick={persistOrganization}>Save shared business profile</button>
          </div>
        </Panel>
        <Panel title={`TheBarcode ${APP_VERSION}`}>
          <div className="release-card">
            <p><b>Channel:</b> {APP_CHANNEL}</p>
            <div className="release-notes-scroll" aria-label="Release notes by topic">{releaseGroups.map(group=><details key={group.title}><summary><span>{group.title}</span><small>{group.notes.length} notes</small></summary><ul>{group.notes.map(note=><li key={note}>{note}</li>)}</ul></details>)}</div>
            <Field label="Update manifest URL"><input value={updateUrl} onChange={(e) => setUpdateUrl(e.target.value)} placeholder="https://…/latest.json" /></Field>
            <p className="update-source-note">TheBarcode checks the public release branch first, then the official mirrors. A configured direct HTTPS manifest is also checked. If automatic installation is unavailable, you can <a className="update-source-link" href={driveReleaseFolder} target="_blank" rel="noreferrer">open the manual release folder</a>.</p>
            <div className="button-row"><button onClick={saveTerminal}>Save update channel</button><button disabled={updateBusy} onClick={()=>void checkUpdates(false)}>{updateBusy?"Checking…":"Check for updates"}</button></div>
          </div>
        </Panel>
      </Two></div>}
      {activeSettingsTab==="plan"&&<div className="settings-tab-panel" id="settings-panel-plan" role="tabpanel"><Two>
        <Panel title="Package registration">
          <p className="display-scale-help">Choose the commercial package for this institution. Payment collection is intentionally not connected yet; changing packages only sets the entitlement foundation and never deletes existing data.</p>
          <div className="settings-fields">
            <Field label="Package"><select value={registration.planCode||"OpenPreview"} onChange={e=>choosePlan(e.target.value)}>{(registrationPlans.length?registrationPlans:[{code:"OpenPreview",name:"Open Preview",price:"Local testing"},{code:"Lite",name:"TheBarcode Lite",price:"KES 499 / month"},{code:"Connect",name:"TheBarcode Connect",price:"KES 2,490 / month"},{code:"Growth",name:"TheBarcode Growth",price:"KES 5,490 / month"},{code:"Enterprise",name:"TheBarcode Enterprise",price:"From KES 12,500 / month"}]).map((x:any)=><option key={x.code} value={x.code}>{x.name} · {x.price}</option>)}</select></Field>
            <Field label="Deployment mode"><select value={registration.deploymentMode||"Local"} onChange={e=>setRegistration((x:any)=>({...x,deploymentMode:e.target.value}))}><option>Local</option><option>Shared server</option><option>Cloud</option></select></Field>
            <Field label="Billing status"><select value={registration.billingStatus||"Trial"} onChange={e=>setRegistration((x:any)=>({...x,billingStatus:e.target.value}))}><option>Trial</option><option>Active</option><option>Grace</option><option>Suspended</option></select></Field>
            <div className="settings-limit-grid"><Field label="Branch limit"><input type="number" min="1" value={registration.branchLimit||1} onChange={e=>setRegistration((x:any)=>({...x,branchLimit:+e.target.value}))}/></Field><Field label="Terminal limit"><input type="number" min="1" value={registration.terminalLimit||1} onChange={e=>setRegistration((x:any)=>({...x,terminalLimit:+e.target.value}))}/></Field><Field label="User limit"><input type="number" min="1" value={registration.userLimit||1} onChange={e=>setRegistration((x:any)=>({...x,userLimit:+e.target.value}))}/></Field></div>
            <div className="module-selector"><b>Entitled modules</b><small>Core sales, inventory and expenses are always required. Package limits are enforced by the API.</small>{[{key:"sales",name:"Sales & POS",locked:true},{key:"inventory",name:"Inventory",locked:true},{key:"expenses",name:"Expenses",locked:true},{key:"production",name:selectedIndustry.productionLabel},{key:"reports",name:"Reports"},{key:"ai",name:"Smart Insights"},{key:"accounting",name:"Accounting"}].map((m:any)=>{const plan=registrationPlans.find(x=>x.code===registration.planCode);const allowed=registration.planCode==="OpenPreview"||plan?.modules?.includes(m.key);return <label key={m.key}><input type="checkbox" disabled={m.locked||!allowed} checked={(registration.enabledModules||"").split(",").includes(m.key)} onChange={e=>{const next=new Set((registration.enabledModules||"").split(",").filter(Boolean));e.target.checked?next.add(m.key):next.delete(m.key);setRegistration((x:any)=>({...x,enabledModules:Array.from(next).join(",")}))}}/> {m.name}{!allowed&&<small> · package upgrade required</small>}</label>})}</div>
            <button className="outline-button" onClick={persistRegistration}>Save package and module access</button>
          </div>
        </Panel>
        <Panel title="Current entitlement state"><div className="industry-preview"><b>{registrationPlans.find(x=>x.code===registration.planCode)?.name||registration.planCode||"Open Preview"}</b><small>{registration.billingStatus||"Trial"} · {registration.deploymentMode||"Local"} · {registration.branchLimit||1} branch(es) · {registration.terminalLimit||1} terminal(s) · {registration.userLimit||1} user(s)</small></div><p className="display-scale-help">Subscription payments, renewals and suspension automation will plug into this state later without changing the data model.</p></Panel>
      </Two></div>}
      {activeSettingsTab==="hardware"&&<div className="settings-tab-panel" id="settings-panel-hardware" role="tabpanel"><Two>
        <Panel title="Receipt printer">
          <div className="device-row">
            <i>▤</i>
            <span>
              <b>Xprinter XP-80</b>
              <small>Local ESC/POS bridge · USB or Bluetooth queue</small>
            </span>
            <em>{bridgeReady ? "Bridge ready" : "Bridge offline"}</em>
          </div>
          <div className="settings-fields printer-settings">
            <Field label="Windows printer">
              <select value={printer} onChange={(e) => setPrinter(e.target.value)}>
                <option value="">Choose printer…</option>
                {printer&&!printers.some(name=>name===printer)&&<option value={printer}>{printer} · saved printer</option>}
                {printers.map((name) => <option key={name}>{name}</option>)}
              </select>
            </Field>
            <button className="outline-button" onClick={()=>void refreshPrinters()}>Refresh printer list</button>
            <small className="muted">Receipts print directly through the configured printer. Browser and Windows print dialogs are not used.</small>
            {!bridgeReady&&<small className={printerScanError?"printer-service-error":"muted"} role={printerScanError?"alert":undefined}>{printerScanError?`Printer service unavailable: ${printerScanError}`:"Checking installed printers…"}</small>}
            <button className="outline-button" onClick={() => {
              localStorage.setItem("receipt_printer", printer);
              localStorage.removeItem("silent_print");
              localStorage.setItem("receipt_cut", "false");
              notify("XP-80 printer configuration saved");
            }}>Save printer</button>
          </div>
          <button
            className="outline-button"
            onClick={async () => {
              localStorage.setItem("receipt_printer", printer);
              localStorage.removeItem("silent_print");
              try {
                await printReceiptText(testReceiptText());
                notify("Test receipt sent to the selected printer");
              } catch (error) {
                notify(error instanceof Error?error.message:"The selected receipt printer could not be reached");
              }
            }}
          >
            Print test receipt
          </button>
          <div className="printer-queue-actions">
            <span className="muted">{printerQueue.length ? `${printerQueue.length} TheBarcode job${printerQueue.length===1?"":"s"} in queue` : "No TheBarcode jobs in queue"}</span>
            <button className="danger-button" disabled={!printer || !printerQueue.length} onClick={async()=>{try{const removed=await clearPrinterQueue(printer);setPrinterQueue([]);notify(removed?`${removed} TheBarcode print job${removed===1?"":"s"} cancelled`:"No TheBarcode print jobs needed cancelling")}catch(e){notify(e instanceof Error?e.message:"The printer queue could not be cleared")}}}>Cancel TheBarcode print jobs</button>
          </div>
        </Panel>
        <Panel title="Sync & connectivity">
          <div className="device-row">
            <i>↻</i>
            <span>
              <b>Offline-first mode</b>
              <small>Queued records remain safely on device</small>
            </span>
          </div>
          <button
            className="outline-button"
            onClick={async () =>
              notify(`Synchronized ${await syncOutbox()} records`)
            }
          >
            Sync now
          </button>
        </Panel>
      </Two>
      <Two>
        <Panel title="Branches">
          <div className="settings-fields">
            <Field label="Branch name"><input value={branchForm.name} onChange={(e)=>setBranchForm({...branchForm,name:e.target.value})}/></Field>
            <Field label="Short code"><input value={branchForm.code} onChange={(e)=>setBranchForm({...branchForm,code:e.target.value.toUpperCase()})} placeholder="MAIN"/></Field>
            <Field label="Address"><input value={branchForm.address} onChange={(e)=>setBranchForm({...branchForm,address:e.target.value})}/></Field>
            <Field label="Phone"><input value={branchForm.phone} onChange={(e)=>setBranchForm({...branchForm,phone:e.target.value})}/></Field>
            <button className="outline-button" onClick={persistBranch}>Add branch</button>
            <div className="setting-list">{branches.map(x=><span key={x.id}><b>{x.name}</b><small>{x.code} · {x.active?"Active":"Inactive"}</small></span>)}</div>
          </div>
        </Panel>
        <Panel title="This terminal">
          <div className="settings-fields">
            <Field label="Branch"><select value={branchId} onChange={(e)=>setBranchId(e.target.value)}><option value="">Choose branch…</option>{branches.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="Terminal name"><input value={terminalName} onChange={(e)=>setTerminalName(e.target.value)}/></Field>
            <Field label="Unique device key"><input value={deviceName} onChange={(e)=>setDeviceName(e.target.value)}/></Field>
            <Field label="Shared local or hosted API URL"><input value={apiUrl} onChange={(e)=>setApiUrl(e.target.value)} placeholder="/api or https://api.example.com/api"/></Field>
            <button className="outline-button" onClick={async()=>{saveTerminal();await persistTerminal()}}>Register and save terminal</button>
            <div className="setting-list">{terminals.map(x=><span key={x.id}><b>{x.name}</b><small>{branches.find(b=>b.id===x.branchId)?.name||"Unknown branch"} · {x.deviceKey}</small></span>)}</div>
          </div>
        </Panel>
      </Two>
      <Panel title="Receipt layout & behaviour">
        <div className="receipt-config-grid">
          <Field label="Paper width"><select value={receiptConfig.paperWidthMm} onChange={(e)=>setReceiptConfig({...receiptConfig,paperWidthMm:+e.target.value})}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></Field>
          <Field label="Copies"><select value={receiptConfig.copies} onChange={(e)=>setReceiptConfig({...receiptConfig,copies:+e.target.value})}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></Field>
          <Field label="Credit-sale printing"><select value={receiptConfig.creditSalePrintMode} onChange={(e)=>setReceiptConfig({...receiptConfig,creditSalePrintMode:e.target.value})}><option>Never</option><option>Optional</option><option>Automatic</option></select></Field>
          <Field label="Later payment receipt"><select value={receiptConfig.paymentReceiptPrintMode} onChange={(e)=>setReceiptConfig({...receiptConfig,paymentReceiptPrintMode:e.target.value})}><option>Never</option><option>Optional</option><option>Automatic</option></select></Field>
          <Field label="Receipt prefix"><input value={receiptConfig.receiptPrefix} onChange={(e)=>setReceiptConfig({...receiptConfig,receiptPrefix:e.target.value})}/></Field>
          <Field label="Invoice prefix"><input value={receiptConfig.invoicePrefix} onChange={(e)=>setReceiptConfig({...receiptConfig,invoicePrefix:e.target.value})}/></Field>
          <Field label="Payment prefix"><input value={receiptConfig.paymentPrefix} onChange={(e)=>setReceiptConfig({...receiptConfig,paymentPrefix:e.target.value})}/></Field>
          <Field label="Footer message"><input value={receiptConfig.footer} onChange={(e)=>setReceiptConfig({...receiptConfig,footer:e.target.value})}/></Field>
        </div>
        <div className="receipt-toggles">
          {[["Show business details","showBusinessDetails"],["Show customer","showCustomer"],["Show cashier","showCashier"],["Show tax","showTax"],["Show customer balance","showCustomerBalance"],["Show Beyond Raw Data signoff","showPoweredBy"],["Automatically print paid sales","autoPrintPaidSale"]].map(([label,key])=><label key={key}><input type="checkbox" checked={Boolean((receiptConfig as any)[key])} onChange={(e)=>setReceiptConfig({...receiptConfig,[key]:e.target.checked})}/>{label}</label>)}
        </div>
        <button className="outline-button" onClick={persistReceipt}>Save shared receipt configuration</button>
      </Panel>
      </div>}
      {activeSettingsTab==="intelligence"&&["Owner","Manager"].includes(user.role)&&<div className="settings-tab-panel" id="settings-panel-intelligence" role="tabpanel"><Panel title="Smart Insights provider">
        <p className="muted">Optional server-side chat model configuration. The key is encrypted before storage and is never returned to the browser. If this is disabled or unavailable, TheBarcode automatically uses its deterministic business rule engine.</p>
        <div className="receipt-config-grid"><Field label="HTTPS chat-completions endpoint"><input value={insightsConfig.endpoint} onChange={e=>setInsightsConfig({...insightsConfig,endpoint:e.target.value})}/></Field><Field label="Model"><input value={insightsConfig.model} onChange={e=>setInsightsConfig({...insightsConfig,model:e.target.value})}/></Field><Field label={insightsConfig.apiKeyConfigured?"Replace API key (configured)":"API key"}><input type="password" autoComplete="new-password" value={insightsConfig.apiKey} onChange={e=>setInsightsConfig({...insightsConfig,apiKey:e.target.value})}/></Field></div>
        <div className="receipt-toggles"><label><input type="checkbox" checked={insightsConfig.enabled} onChange={e=>setInsightsConfig({...insightsConfig,enabled:e.target.checked})}/> Enable configured AI provider</label><label><input type="checkbox" checked={insightsConfig.allowUserNames} onChange={e=>setInsightsConfig({...insightsConfig,allowUserNames:e.target.checked})}/> Allow staff names in operational activity summaries</label><label><input type="checkbox" checked={insightsConfig.clearApiKey} onChange={e=>setInsightsConfig({...insightsConfig,clearApiKey:e.target.checked})}/> Remove saved API key</label></div><button className="outline-button" onClick={persistInsights}>Save Smart Insights configuration</button>
      </Panel></div>}
      {activeSettingsTab==="data"&&user.role === "Owner" && <div className="settings-tab-panel" id="settings-panel-data" role="tabpanel">
        <Panel title="Data protection & purge">
          <p className="muted">Create local database backups, restore an earlier snapshot, or remove live business records before handover. Purge always creates and verifies a backup first. Staff accounts, business settings, terminals, receipt settings, accounting setup and the separate Demo environment are preserved; live journals, periods and operational records are removed.</p>
          <div className="button-row"><button type="button" disabled={maintenanceBusy||Boolean(backupJobId)} onClick={backupNow}>{maintenanceBusy?"Queuing…":"Back up now"}</button></div>
          {backupJob&&<div className="background-job-status" role="status"><b>Backup {backupJob.status}</b><span>{backupJob.stage}</span>{backupJob.error&&<span className="accounting-negative">{backupJob.error}</span>}{backupJob.status==="Failed"&&<button type="button" className="secondary-button" onClick={()=>void retryBackup()}>Retry backup</button>}</div>}
          <div className="setting-list">{backups.length===0?<span><small>No manual backups yet</small></span>:backups.slice(0,10).map(x=><span key={x.fileName}><b>{new Date(x.createdAt).toLocaleString()}</b><small>{x.fileName} · {(Number(x.sizeBytes)/1048576).toFixed(1)} MB</small><button className="table-action" disabled={maintenanceBusy} onClick={()=>restoreBackup(x.fileName)}>Restore</button></span>)}</div>
          <div className="settings-fields purge-controls"><Field label="Reason for purge"><input value={purgeReason} onChange={e=>setPurgeReason(e.target.value)} placeholder="For example: remove pre-launch test entries"/></Field><Field label="Type PURGE LIVE DATA to confirm"><input value={purgeConfirmation} onChange={e=>setPurgeConfirmation(e.target.value)} autoComplete="off"/></Field><button className="danger-button" disabled={maintenanceBusy||purgeConfirmation!=="PURGE LIVE DATA"} onClick={purgeNow}>{maintenanceBusy?"Backing up and purging…":"Back up, then purge live records"}</button></div>
        </Panel>
        <Panel title="Demo environment">
          <p className="muted">
            Demo records are marked separately from real data and the offline
            outbox.
          </p>
          <div className="button-row">
            <button onClick={restore}>Restore demo data</button>
            <button className="danger-button" onClick={remove}>
              Remove demo data
            </button>
          </div>
        </Panel>
      </div>}
      <footer className="settings-brand-footer" aria-label="TheBarcode publisher and version">
        <img src="/beyond-raw-data-logo.png" alt="Beyond Raw Data" />
        <small>TheBarcode Lite · v{APP_VERSION}</small>
      </footer>
    </Page>
  );
}
async function downloadPdfReport({from,to,summary,detail,accounting,accountingTrial,productionRuns}:{from:string;to:string;summary:any;detail:any;accounting?:any;accountingTrial?:any[];productionRuns?:any[]}){
  const [{jsPDF},{default:autoTable}]=await Promise.all([import("jspdf"),import("jspdf-autotable")]);
  if(!summary||!detail)return;
  const org=cachedOrganizationSettings(),doc=new jsPDF({unit:"mm",format:"a4"}),ink=[20,35,44] as [number,number,number],teal=[20,104,91] as [number,number,number],coral=[235,103,70] as [number,number,number],amber=[205,145,54] as [number,number,number],muted=[103,120,116] as [number,number,number],line=[224,232,228] as [number,number,number],soft=[244,248,246] as [number,number,number];
  const revenue=Number(summary.revenue||0),cost=Number(summary.cost||0),expenses=Number(summary.expenses||0),gross=revenue-cost,net=gross-expenses,collectionRate=Number(summary.collectionRate||0),cashCollected=Number(summary.cashCollected||0),salesCollected=Number(summary.salesCollected||0),fmt=(n:number)=>{const value=Number(n||0);if(Math.abs(value)<0.005)return "—";const text=`${org.currency} ${Math.abs(value).toLocaleString(undefined,{maximumFractionDigits:0})}`;return value<0?`(${text})`:text};
  const kpi=(x:number,y:number,w:number,label:string,value:string,detailText:string,color: [number,number,number])=>{doc.setFillColor(...soft);doc.roundedRect(x,y,w,25,2.5,2.5,"F");doc.setFillColor(...color);doc.roundedRect(x,y,2.2,25,1,1,"F");doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(...muted);doc.text(label,x+6,y+7);doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(...ink);doc.text(value,x+6,y+16,{maxWidth:w-9});doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(...muted);doc.text(detailText,x+6,y+21,{maxWidth:w-9})};
  const table=(startY:number,head:string[],body:any[][],options:any={})=>{const {headStyles:customHeadStyles,bodyStyles:customBodyStyles,styles:customStyles,...rest}=options;autoTable(doc,{startY,head:[head],body,theme:"plain",margin:{left:14,right:14},headStyles:{fillColor:teal,textColor:[255,255,255],fontStyle:"bold",fontSize:7.5,cellPadding:2.4,...customHeadStyles},bodyStyles:{textColor:ink,fontSize:7.5,cellPadding:2.3,lineColor:line,lineWidth:.15,...customBodyStyles},alternateRowStyles:{fillColor:[249,251,250]},styles:{overflow:"linebreak",cellWidth:"wrap",...customStyles},...rest});return Number((doc as any).lastAutoTable.finalY||startY)};
  const heading=(label:string,y:number,color=teal)=>{doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(...ink);doc.text(label,14,y);doc.setDrawColor(...color);doc.setLineWidth(.7);doc.line(14,y+2,48,y+2)};
  // Branded cover and decision-focused KPI strip.
  doc.setFillColor(...ink);doc.rect(0,0,210,38,"F");doc.setFillColor(...teal);doc.rect(0,35,210,3,"F");doc.setFont("helvetica","bold");doc.setFontSize(21);doc.setTextColor(255);doc.text(org.name||"TheBarcode",14,15);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Management report",14,23);doc.setFontSize(7.5);doc.setTextColor(205,225,219);doc.text(`${from} to ${to}  ·  Generated ${new Date().toLocaleString()}`,14,30);
  doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(...teal);doc.text("TheBarcode",177,15);doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(210,230,224);doc.text("Smarter Business Operations",150,22);
  kpi(14,47,43,"Revenue",fmt(revenue),`${summary.salesCount||0} posted sales`,teal);kpi(60,47,43,"Gross profit",fmt(gross),revenue?`${(gross/revenue*100).toFixed(1)}% margin`:"No sales",gross>=0?teal:coral);kpi(106,47,43,"Collected",`${collectionRate.toFixed(1)}%`,fmt(salesCollected)+" against sales",amber);kpi(152,47,44,"Net profit",fmt(net),`After ${fmt(expenses)} approved expenses`,net>=0?teal:coral);
  heading("Performance trend",84);const daily=(detail.daily||[]).slice(-14),chartX=14,chartY=91,chartW=182,chartH=56,base=chartY+chartH,max=Math.max(1,...daily.map((x:any)=>Number(x.revenue||0)),...daily.map((x:any)=>Number(x.profit||0)));doc.setDrawColor(...line);doc.setLineWidth(.25);for(let i=0;i<=4;i++){const gy=chartY+i*chartH/4;doc.line(chartX,gy,chartX+chartW,gy);doc.setFont("helvetica","normal");doc.setFontSize(5.5);doc.setTextColor(...muted);doc.text(fmt(max*(4-i)/4),chartX,gy-1)}
  const groupW=chartW/Math.max(1,daily.length);daily.forEach((row:any,i:number)=>{const x=chartX+i*groupW+Math.max(1,(groupW-7)/2),revenueH=chartH*Number(row.revenue||0)/max,profitH=chartH*Math.max(0,Number(row.profit||0))/max;doc.setFillColor(...teal);doc.roundedRect(x,base-revenueH,3,Math.max(1,revenueH),.7,.7,"F");doc.setFillColor(...coral);doc.roundedRect(x+3.5,base-profitH,3,Math.max(1,profitH),.7,.7,"F");if(daily.length<=10||i%2===0){doc.setFont("helvetica","normal");doc.setFontSize(5.2);doc.setTextColor(...muted);doc.text(new Date(row.date).toLocaleDateString(undefined,{month:"short",day:"numeric"}),x-1,base+7,{angle:35})}});doc.setFillColor(...teal);doc.rect(157,84,3,3,"F");doc.setFontSize(6.5);doc.setTextColor(...muted);doc.text("Revenue",162,87);doc.setFillColor(...coral);doc.rect(180,84,3,3,"F");doc.text("Gross profit",185,87);
  const pY=159;heading("Period result",pY);const pnlEnd=table(pY+5,["Profit & loss","Amount"],[["Sales revenue",fmt(revenue)],["Cost of goods sold",fmt(-cost)],["Gross profit",fmt(gross)],["Approved operating expenses",fmt(-expenses)],["Net profit",fmt(net)],["Cash received in period",fmt(cashCollected)]],{columnStyles:{0:{cellWidth:60},1:{halign:"right",cellWidth:30}},tableWidth:92,margin:{left:14,right:104}});const mix=(detail.paymentMix||[]).map((x:any)=>[x.name,fmt(Number(x.amount))]);const mixEnd=table(pY+5,["Payment mix","Collected"],mix.length?mix:[["No payments recorded","—"]],{columnStyles:{0:{cellWidth:57},1:{halign:"right",cellWidth:33}},tableWidth:92,margin:{left:104,right:14},headStyles:{fillColor:amber}});let y=Math.max(pnlEnd,mixEnd)+9;heading("Top sellers",y);y=table(y+5,["Item","Units","Revenue","Gross profit"],(detail.topSellers||[]).slice(0,8).map((x:any)=>[x.name,Number(x.quantity||0).toLocaleString(),fmt(Number(x.revenue||0)),fmt(Number(x.profit||0))]),{columnStyles:{0:{cellWidth:82},1:{halign:"right",cellWidth:22},2:{halign:"right",cellWidth:37},3:{halign:"right",cellWidth:37}}})+8;
  // Detail page keeps operational risks, expenses and accounting together.
  doc.addPage();doc.setFillColor(...ink);doc.rect(0,0,210,25,"F");doc.setFillColor(...teal);doc.rect(0,23,210,2,"F");doc.setFont("helvetica","bold");doc.setFontSize(14);doc.setTextColor(255);doc.text("Operations & controls",14,15);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(205,225,219);doc.text(`${from} to ${to}  ·  Live operational detail`,145,15);
  y=35;heading("Stock attention",y,coral);const risks=(detail.lowStock||[]).slice(0,14);y=table(y+5,["Item","Category","Available","Reorder at","Days left"],risks.length?risks.map((x:any)=>[x.name,x.category,String(x.stock),String(x.minStock),x.daysRemaining==null?"—":`${Number(x.daysRemaining).toFixed(1)} d`]):[["No projected low-stock items","—","—","—","—"]],{headStyles:{fillColor:coral},columnStyles:{0:{cellWidth:68},1:{cellWidth:43},2:{halign:"right",cellWidth:22},3:{halign:"right",cellWidth:22},4:{halign:"right",cellWidth:25}}})+8;
  heading("Expense register",y);const expenseRows=(detail.expenseRecords||[]).slice(0,16);y=table(y+5,["Date","Expense","Category","Amount","Paid","Method"],expenseRows.length?expenseRows.map((x:any)=>[String(x.date),x.description,x.category,fmt(Number(x.amount||0)),fmt(Number(x.paidAmount||0)),x.method]):[["—","No approved expenses","—","—","—","—"]],{columnStyles:{0:{cellWidth:24},1:{cellWidth:55},2:{cellWidth:35},3:{halign:"right",cellWidth:25},4:{halign:"right",cellWidth:25},5:{cellWidth:22}}})+8;
  if(accounting){heading("Accounting snapshot",y);const accountingRows=[["Revenue",fmt(Number(accounting.revenue||0))],["Cost of goods sold",fmt(-Number(accounting.cost||0))],["Gross profit",fmt(Number(accounting.grossProfit||0))],["Approved expenses",fmt(-Number(accounting.expenses||0))],["Inventory purchases (capitalised)",fmt(Number(accounting.inventoryPurchases||0))],["Net profit",fmt(Number(accounting.netProfit||0))],["Receivables at period end",fmt(Number(accounting.receivables||0))],["Payables at period end",fmt(Number(accounting.payables||0))]];const accountingEnd=table(y+5,["Statement line","Amount"],accountingRows,{columnStyles:{0:{cellWidth:115},1:{halign:"right",cellWidth:55}}});y=accountingEnd+8;if(accountingTrial?.length){heading("Trial balance",y);y=table(y+5,["Account","Debit","Credit"],accountingTrial.slice(0,24).map((x:any)=>[`${x.code} · ${x.name}`,fmt(Number(x.debit||0)),fmt(Number(x.credit||0))]),{columnStyles:{0:{cellWidth:100},1:{halign:"right",cellWidth:35},2:{halign:"right",cellWidth:35}}})+6}}
  if(accounting){heading("Receivables & payables ageing",y);const ar=accounting.receivablesAging||{},ap=accounting.payablesAging||{};y=table(y+5,["Age band","Receivables","Payables"],[["Not yet due",fmt(ar.current),fmt(ap.current)],["1–30 days overdue",fmt(ar.overdue1To30),fmt(ap.overdue1To30)],["31–60 days overdue",fmt(ar.overdue31To60),fmt(ap.overdue31To60)],["Over 60 days overdue",fmt(ar.overdueOver60),fmt(ap.overdueOver60)]],{columnStyles:{0:{cellWidth:80},1:{halign:"right",cellWidth:48},2:{halign:"right",cellWidth:48}}})+8}
  const reportProduction=(productionRuns||[]).filter((x:any)=>String(x.occurredAt).slice(0,10)>=from&&String(x.occurredAt).slice(0,10)<=to);if(reportProduction.length){heading("Production costing",y);y=table(y+5,["Completed","Output","Quantity","Cost / unit","Total cost"],reportProduction.slice(0,18).map((x:any)=>[new Date(x.occurredAt).toLocaleDateString(),x.productName,Number(x.quantityProduced||0).toLocaleString(),fmt(Number(x.unitCost||0)),fmt(Number(x.totalCost||0))]),{columnStyles:{0:{cellWidth:32},1:{cellWidth:58},2:{halign:"right",cellWidth:28},3:{halign:"right",cellWidth:33},4:{halign:"right",cellWidth:35}}})+8}  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setDrawColor(...line);doc.setLineWidth(.25);doc.line(14,284,196,284);doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(...muted);doc.text(`TheBarcode  ·  ${org.name}  ·  ${from} — ${to}`,14,290);doc.text(`Page ${p} of ${pages}`,196,290,{align:"right"});doc.setTextColor(...teal);doc.text("Smarter Business Operations",105,294,{align:"center"})}doc.save(`TheBarcode-report-${from}-to-${to}.pdf`);
}
const inventoryUnits=["item","piece","bottle","can","pack","tray","bag","portion","serving","shot","glass","ml","L","g","kg"];
const measureUnits=["item","piece","bottle","can","pack","tray","bag","portion","serving","shot","glass","ml","L","g","kg"];
const productTemplateHeaders=["name","category","item_type","brand","barcode_sku","stock_unit","package_quantity","package_unit","tracking_mode","cost_price","selling_price","opening_stock","minimum_stock","supplier","tax_rate","sellable"];
function csvCell(value:unknown){const text=String(value??"");return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}
function downloadProductTemplate(){const examples=[productTemplateHeaders,["Mineral Water","Soft drinks","Product","Aqua","WATER-500","bottle",500,"ml","Discrete",35,80,24,8,"Demo Supplier",0,"TRUE"],["Mineral Water","Soft drinks","Product","Aqua","WATER-1L","bottle",1,"L","Discrete",60,120,12,6,"Demo Supplier",0,"TRUE"],["Coffee beans","Coffee","Ingredient","","COFFEE-KG","kg",1,"kg","Measured",1200,1800,8.5,2,"Demo Supplier",16,"FALSE"],["Flour 5 kg","Kitchen consumable","Ingredient","","FLOUR-5KG","bag",5,"kg","Discrete",620,0,6,2,"Demo Supplier",0,"FALSE"]];const blob=new Blob(["\\ufeff"+examples.map(row=>row.map(csvCell).join(",")).join("\\r\\n")],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="TheBarcode-item-import-template.csv";a.click();URL.revokeObjectURL(a.href)}
function readCsv(text:string){const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===","&&!quoted){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=""}else cell+=c}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
function parseProductCsv(text:string){const matrix=readCsv(text.replace(/^\ufeff/,""));if(matrix.length<2)throw new Error("The template must contain a header and at least one item row");const headers=matrix[0].map(x=>x.trim().toLowerCase().replaceAll(" ","_"));const missing=productTemplateHeaders.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Missing columns: ${missing.join(", ")}`);const at=(row:string[],name:string)=>row[headers.indexOf(name)]?.trim()??"",num=(value:string)=>value===""?0:Number(value),bool=(value:string)=>["true","yes","1","y"].includes(value.toLowerCase());return matrix.slice(1).map((row,index)=>({rowNumber:index+2,name:at(row,"name"),category:at(row,"category"),itemType:at(row,"item_type")||"Product",brand:at(row,"brand")||null,barcode:at(row,"barcode_sku")||null,stockUnit:at(row,"stock_unit"),packageQuantity:num(at(row,"package_quantity")),packageUnit:at(row,"package_unit"),trackingMode:at(row,"tracking_mode"),costPrice:num(at(row,"cost_price")),sellingPrice:num(at(row,"selling_price")),openingStock:num(at(row,"opening_stock")),minimumStock:num(at(row,"minimum_stock")),supplier:at(row,"supplier")||null,taxRate:num(at(row,"tax_rate")),sellable:bool(at(row,"sellable"))}))}
function validateProductRows(rows:any[]){const allowed=new Set(inventoryUnits.map(x=>x.toLowerCase())),seen=new Set<string>(),variants=new Set<string>();return rows.flatMap(row=>{const errors:string[]=[];if(!row.name)errors.push("Item name is required");if(!row.category)errors.push("Category is required");if(!allowed.has(String(row.stockUnit).toLowerCase()))errors.push("Unsupported stock unit");if(!allowed.has(String(row.packageUnit).toLowerCase()))errors.push("Unsupported package unit");for(const key of ["packageQuantity","costPrice","sellingPrice","openingStock","minimumStock","taxRate"])if(!Number.isFinite(row[key]))errors.push(`${key} must be numeric`);if(row.packageQuantity<=0)errors.push("Package quantity must be greater than zero");if(row.costPrice<0||row.sellingPrice<0||row.openingStock<0||row.minimumStock<0)errors.push("Prices and stock cannot be negative");if(row.openingStock>0&&row.costPrice<=0)errors.push("Initial cost price is required when opening stock is provided");if(row.taxRate<0||row.taxRate>100)errors.push("Tax rate must be between 0 and 100");if(!["discrete","measured"].includes(String(row.trackingMode).toLowerCase()))errors.push("Tracking mode must be Discrete or Measured");if(String(row.trackingMode).toLowerCase()==="discrete"&&(!Number.isInteger(row.openingStock)||!Number.isInteger(row.minimumStock)))errors.push("Discrete stock requires whole quantities");if([row.packageQuantity,row.openingStock,row.minimumStock].some((x:number)=>{const decimal=String(x).split(".")[1];return decimal&&decimal.length>3}))errors.push("Quantities support at most 3 decimals");if(row.barcode){const key=String(row.barcode).toLowerCase();if(seen.has(key))errors.push("Duplicate barcode/SKU in file");seen.add(key)}const variant=`${row.name}|${row.category}|${row.packageQuantity}|${row.packageUnit}`.toLowerCase();if(variants.has(variant))errors.push("Duplicate item/package-size variant in file");variants.add(variant);return errors.length?[{row:row.rowNumber,errors}]:[]})}
function Page({ children }: { children: ReactNode }) {
  return <div className="spec-page">{children}</div>;
}
function Intro({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="page-intro">
      <span>
        <h2>{title}</h2>
        <p>{text}</p>
      </span>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}
function Kpis({ items,onSelect }: { items: string[][];onSelect?:(label:string)=>void }) {
  const [detail,setDetail]=useState<string[]|null>(null);const activate=(item:string[])=>onSelect?onSelect(item[0]):setDetail(item);
  return (
    <><div className={`spec-kpis count-${items.length}`}>
      {items.map((x) => (
          <article key={x[0]} className={`interactive-kpi ${x[3]||""}`} onClick={()=>activate(x)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate(x)}}} role="button" tabIndex={0}>
          <small>{x[0]}</small>
          <b>{x[1]}</b>
          <em>{x[2]}</em>
        </article>
      ))}
    </div>{detail&&<div className="modal kpi-detail"><section><button className="close" onClick={()=>setDetail(null)}>×</button><h2>{detail[0]}</h2><strong>{detail[1]}</strong><p>{detail[2]}</p><button onClick={()=>setDetail(null)}>Close</button></section></div>}</>
  );
}
function Two({ children }: { children: ReactNode }) {
  return <div className="spec-two">{children}</div>;
}
function Panel({ title, children,id }: { title: string; children: ReactNode;id?:string }) {
  return (
    <section className="spec-panel" id={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function Chart({ children }: { children: ReactNode }) {
  return (
    <div className="spec-chart">
      <ResponsiveContainer width="100%" height="100%">
        {children as any}
      </ResponsiveContainer>
    </div>
  );
}
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="spec-field">
      <span>{label}</span>
      {children}
      {help && <small className="field-help">{help}</small>}
    </label>
  );
}
function SearchableSelect({ value, onChange, options, placeholder = "Search or choose…", ariaLabel }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string; ariaLabel?: string }) {
  const [query, setQuery] = useState(() => options.find(x => x.value === value)?.label || "");
  const [listId] = useState(() => `search-list-${crypto.randomUUID()}`);
  useEffect(() => { setQuery(options.find(x => x.value === value)?.label || ""); }, [value, options]);
  return <div className="searchable-select"><input list={listId} value={query} placeholder={placeholder} aria-label={ariaLabel} onChange={event => { const next = event.target.value; setQuery(next); const match = options.find(x => x.label.toLocaleLowerCase() === next.trim().toLocaleLowerCase()); if (match) onChange(match.value); }} /><datalist id={listId}>{options.map(option => <option key={option.value} value={option.label} />)}</datalist></div>;
}
function Filter({ children }: { children: ReactNode }) {
  return <div className="filter-row">{children}</div>;
}
function Donut({
  data,
  colors,
  center,
  subtitle,
}: {
  data: (string | number)[][];
  colors: string[];
  center: string;
  subtitle: string;
}) {
  return (
    <div className="donut-layout">
      <Chart>
        <PieChart>
          <Pie
            data={data.map((x) => ({ name: x[0], value: x[1] }))}
            dataKey="value"
            innerRadius={55}
            outerRadius={78}
          >
            {colors.map((c) => (
              <Cell key={c} fill={c} />
            ))}
          </Pie>
        </PieChart>
      </Chart>
      <div className="donut-copy">
        <b>{center}</b>
        <span>{subtitle}</span>
        {data.map((x, i) => (
          <p key={String(x[0])}>
            <i style={{ background: colors[i] }} />
            <span>{x[0]}</span>
            <strong>
              {typeof x[1] === "number" && Number(x[1]) > 100
                ? money(Number(x[1]))
                : x[1]}
            </strong>
          </p>
        ))}
      </div>
    </div>
  );
}
function gridText(value:ReactNode):string {
  if(value==null||typeof value==="boolean")return "";
  if(typeof value==="string"||typeof value==="number")return String(value);
  if(Array.isArray(value))return value.map(gridText).join(" ");
  if(typeof value==="object"&&"props" in value)return gridText((value as any).props?.children);
  return "";
}
function gridSortValue(value:ReactNode):string|number {
  const text=gridText(value).replace(/\s+/g," ").trim(),plain=text.replace(/^[^\d-]*(?=-?\d)/,"").replaceAll(",","");
  const dated=Date.parse(text);if(text&&Number.isFinite(dated)&&(text.includes("/")||text.includes("-")||/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(text)))return dated;
  const numeric=Number(plain.replace(/%$/,"").replace(/[^\d.-].*$/,""));
  if(text&&Number.isFinite(numeric)&&/[\d]/.test(text))return numeric;
  return text.toLocaleLowerCase();
}
function Table({ heads, rows, rowClasses=[], renderDetails, remoteSearch, totalRows }: { heads: string[]; rows: ReactNode[][];rowClasses?:string[];renderDetails?: (row:ReactNode[], index:number)=>ReactNode;remoteSearch?:{value:string;onChange:(value:string)=>void};totalRows?:number }) {
  const [query,setQuery]=useState("");
  const deferredQuery=useDeferredValue(query);
  const [sort,setSort]=useState<{index:number;direction:"asc"|"desc"}|null>(null);
  const [expanded,setExpanded]=useState<number|null>(null);
  const [page,setPage]=useState(0);
  const pageSize=50;
  const statuses = [
    "Healthy",
    "Low",
    "Debt",
    "Watch",
    "Clear",
    "Active",
    "Synced",
    "Queued",
    "Paid",
    "Pending",
    "Superseded",
  ];
  const records=rows.map((cells,index)=>({cells,index,className:rowClasses[index]||""}));
  const normalized=remoteSearch?"":deferredQuery.trim().toLocaleLowerCase();
  const visible=records.filter(row=>!normalized||row.cells.some(cell=>gridText(cell).toLocaleLowerCase().includes(normalized))).sort((left,right)=>{
    if(!sort)return left.index-right.index;
    const a=gridSortValue(left.cells[sort.index]),b=gridSortValue(right.cells[sort.index]);
    const compared=typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"});
    return compared*(sort.direction==="asc"?1:-1)||left.index-right.index;
  });
  const pageCount=Math.max(1,Math.ceil(visible.length/pageSize));
  const currentPage=Math.min(page,pageCount-1);
  const paged=visible.slice(currentPage*pageSize,(currentPage+1)*pageSize);
  const changeSort=(index:number)=>{setPage(0);setSort(current=>current?.index===index?{index,direction:current.direction==="asc"?"desc":"asc"}:{index,direction:"asc"})};
  return (
    <div className="data-grid">
      <div className="grid-toolbar">
        <label><span className="sr-only">Search this grid</span><input type="search" value={remoteSearch?.value??query} onChange={event=>{if(remoteSearch)remoteSearch.onChange(event.target.value);else setQuery(event.target.value);setPage(0)}} placeholder={remoteSearch?"Search all bills…":"Search this grid…"} aria-label={remoteSearch?"Search all bills":"Search this grid"}/></label>
        <small>{visible.length} of {totalRows??rows.length} {(totalRows??rows.length)===1?"row":"rows"}</small>
        {(query||remoteSearch?.value||sort)&&<button type="button" onClick={()=>{setQuery("");remoteSearch?.onChange("");setSort(null);setPage(0)}}>Reset view</button>}
      </div>
      <div className="spec-table-wrap">
      <table className="spec-table">
        <thead>
          <tr>
            {heads.map((x,index) => {const sortable=!/^(action|decision)$/i.test(x);return <th key={x} aria-sort={sort?.index===index?(sort.direction==="asc"?"ascending":"descending"):undefined}>{sortable?<button type="button" className="grid-sort" onClick={()=>changeSort(index)}>{x}<span aria-hidden="true">{sort?.index===index?(sort.direction==="asc"?"↑":"↓"):"↕"}</span></button>:x}</th>})}
          </tr>
        </thead>
        <tbody>
          {paged.map(({cells:r,index,className}) => (<Fragment key={index}>
            <tr
              className={`${className} ${r.some(x=>x==="Debt") ? "row-debt" : ""} ${r.some(x=>x==="Watch") ? "row-watch" : ""}`}
            >
              {r.map((x, j) => (
                <td key={j}>
                  {j===0&&renderDetails?<button type="button" className="table-expand" aria-expanded={expanded===index} aria-label={expanded===index?"Hide details":"Show details"} onClick={()=>setExpanded(current=>current===index?null:index)}>{expanded===index?"−":"+"}</button>:null}
                  {j === r.length - 1 && typeof x==="string" && statuses.includes(x) ? (
                    <span className={`badge ${x.toLowerCase()}`}>{x}</span>
                  ) : (
                    x
                  )}
                </td>
              ))}
            </tr>
            {renderDetails&&expanded===index&&<tr className="grid-detail-row"><td colSpan={heads.length}>{renderDetails(r,index)}</td></tr>}
          </Fragment>))}
          {!visible.length&&<tr><td className="grid-empty" colSpan={heads.length}>{remoteSearch?.value||query?`No rows match “${remoteSearch?.value??query}”.`:"No records in this view."}</td></tr>}
        </tbody>
      </table>
      </div>
      {pageCount>1&&<nav className="grid-pagination" aria-label="Grid pages"><button type="button" className="secondary-button" disabled={currentPage===0} onClick={()=>setPage(x=>Math.max(0,x-1))}>Previous</button><span>Page {currentPage+1} of {pageCount}</span><button type="button" className="secondary-button" disabled={currentPage>=pageCount-1} onClick={()=>setPage(x=>Math.min(pageCount-1,x+1))}>Next</button></nav>}
    </div>
  );
}

function Purchasing({products,notify}:{products:Product[];notify:(x:string)=>void}){
  const [suppliers,setSuppliers]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]),[supplier,setSupplier]=useState({name:"",phone:"",email:"",taxNumber:""}),[selectedSupplier,setSelectedSupplier]=useState(""),[lines,setLines]=useState<any[]>([]),[line,setLine]=useState({productId:products[0]?.id||"",quantity:1,unitCost:0}),[busy,setBusy]=useState(false),[supplierOpen,setSupplierOpen]=useState(false),[supplierBusy,setSupplierBusy]=useState(false);
  const load=async()=>{try{const [s,o]=await Promise.all([getSuppliers(),getPurchaseOrders()]);setSuppliers(s);setOrders(o);setSelectedSupplier(current=>current&&s.some((x:any)=>x.id===current)?current:(s[0]?.id||""))}catch(e){notify(e instanceof Error?e.message:"Purchasing data could not be loaded")}};
  useEffect(()=>{void load()},[]);
  useEffect(()=>{if(!line.productId&&products[0])setLine(x=>({...x,productId:products[0].id,unitCost:products[0].costPrice}))},[products]);
  async function addSupplier(e:FormEvent){e.preventDefault();setSupplierBusy(true);try{const saved=await saveSupplier({...supplier,active:true});setSupplier({name:"",phone:"",email:"",taxNumber:""});await load();setSelectedSupplier(saved.id);notify("Supplier saved") }catch(e){notify(e instanceof Error?e.message:"Supplier could not be saved")}finally{setSupplierBusy(false)}}
  async function archiveSupplier(id:string,name:string){const reason=prompt(`Archive ${name}? Enter a reason (history will be preserved).`)?.trim();if(!reason)return;setSupplierBusy(true);try{await deleteSupplier(id,reason);await load();notify("Supplier archived; purchase history was preserved")}catch(e){notify(e instanceof Error?e.message:"Supplier could not be archived")}finally{setSupplierBusy(false)}}
  async function createOrder(e:FormEvent){e.preventDefault();if(!selectedSupplier||!lines.length){notify("Choose a supplier and add at least one item");return}setBusy(true);try{await savePurchaseOrder({supplierId:selectedSupplier,branchId:null,orderedDate:new Date().toISOString().slice(0,10),expectedDate:null,notes:"Created from purchasing workspace",lines});setLines([]);await load();dispatchEvent(new Event("thebarcode:data-changed"));notify("Purchase order saved")}catch(e){notify(e instanceof Error?e.message:"Purchase order could not be saved")}finally{setBusy(false)}}
  async function send(id:string){try{await sendPurchaseOrder(id);await load();dispatchEvent(new Event("thebarcode:data-changed"));notify("Purchase order marked as ordered")}catch(e){notify(e instanceof Error?e.message:"Purchase order could not be sent")}}
  async function receive(order:any){const remaining=order.lines.filter((x:any)=>x.quantityReceived<x.quantityOrdered);if(!remaining.length){notify("This order is already fully received");return}const first=remaining[0],value=Number(prompt(`Receive quantity for ${first.productName} (remaining ${first.quantityOrdered-first.quantityReceived})`,String(first.quantityOrdered-first.quantityReceived)));if(!Number.isFinite(value)||value<=0)return;const lot=prompt("Lot number (optional)")||null;const expiry=prompt("Expiry date YYYY-MM-DD (optional)")||null;try{await receivePurchaseOrder(order.id,{notes:"Received from purchasing workspace",deviceId:localStorage.getItem("device_id"),lines:[{lineId:first.id,quantity:value,unitCost:first.unitCost,lotNumber:lot,expiryDate:expiry}]});await load();dispatchEvent(new Event("thebarcode:data-changed"));notify("Receipt recorded; stock and cost updated")}catch(e){notify(e instanceof Error?e.message:"Purchase receipt could not be recorded")}}
  void createOrder;
  const orderTotal=lines.reduce((sum,x)=>sum+(Number(x.quantity)||0)*(Number(x.unitCost)||0),0);
  return <Page><Intro title="Purchasing" text="Suppliers, purchase orders and goods received update inventory and weighted cost together." action="+ Manage suppliers" onAction={()=>setSupplierOpen(true)}/><div className="spec-two"><Panel title="New purchase order"><form className="inline-form purchasing-order-form"><SearchableSelect value={selectedSupplier} onChange={setSelectedSupplier} options={suppliers.map(s=>({value:s.id,label:s.name}))} placeholder="Search suppliers…" ariaLabel="Search suppliers" /><SearchableSelect value={line.productId} onChange={productId=>{const p=products.find(x=>x.id===productId);setLine({...line,productId,unitCost:p?.costPrice||0,quantity:p?.trackingMode==="Discrete"?Math.max(1,Math.ceil(Number(line.quantity)||1)):line.quantity})}} options={products.filter(x=>x.active).map(p=>({value:p.id,label:`${p.name} · ${p.unit}`}))} placeholder="Search items…" ariaLabel="Search purchase items" /><input type="number" min={products.find(p=>p.id===line.productId)?.trackingMode==="Discrete"?"1":"0.001"} step={products.find(p=>p.id===line.productId)?.trackingMode==="Discrete"?"1":"0.001"} value={line.quantity} onChange={e=>setLine({...line,quantity:Number(e.target.value)})}/><input type="number" min="0" step="0.01" value={line.unitCost} onChange={e=>setLine({...line,unitCost:Number(e.target.value)})}/><button type="button" className="secondary-button" onClick={()=>{if(line.productId&&line.quantity>0)setLines(x=>[...x.filter(y=>y.productId!==line.productId),line])}}>Add item</button><button type="submit" disabled={busy}>Save order ({lines.length})</button></form>{lines.length>0&&<div className="purchase-line-summary"><p className="muted">{lines.map(x=>`${products.find(p=>p.id===x.productId)?.name||"Item"} × ${x.quantity}`).join(" · ")}</p><strong>Order total {money(orderTotal)}</strong></div>}</Panel><Panel title="Supplier directory"><div className="supplier-directory"><strong>{suppliers.length} active supplier{suppliers.length===1?"":"s"}</strong><p className="muted">Supplier records are managed separately so purchase history remains intact.</p><button className="secondary-button" onClick={()=>setSupplierOpen(true)}>Open supplier directory</button></div></Panel></div><Panel title="Purchase orders"><Table heads={["Number","Supplier","Status","Total","Ordered","Action"]} rows={orders.map(o=>[o.number,o.supplierName,o.status,money(o.total),String(o.orderedDate),<span className="button-row"><button className="table-action" disabled={o.status!=="Draft"} onClick={()=>send(o.id)}>Send</button><button className="table-action" disabled={o.status==="Received"||o.status==="Cancelled"} onClick={()=>receive(o)}>Receive</button></span>])}/></Panel>{supplierOpen&&<div className="modal record-editor supplier-modal"><section><button className="close" aria-label="Close supplier directory" onClick={()=>setSupplierOpen(false)}>×</button><h2>Supplier directory</h2><p className="muted">Add active suppliers here. Archiving removes them from new orders but keeps every historical purchase and stock receipt.</p><form className="customer-form" onSubmit={addSupplier}><Field label="Supplier name"><input required value={supplier.name} onChange={e=>setSupplier({...supplier,name:e.target.value})}/></Field><Field label="Phone"><input value={supplier.phone} onChange={e=>setSupplier({...supplier,phone:e.target.value})}/></Field><Field label="Email"><input type="email" value={supplier.email} onChange={e=>setSupplier({...supplier,email:e.target.value})}/></Field><Field label="Tax number"><input value={supplier.taxNumber} onChange={e=>setSupplier({...supplier,taxNumber:e.target.value})}/></Field><button className="primary-button" disabled={supplierBusy}>{supplierBusy?"Saving…":"Save supplier"}</button></form><div className="supplier-list"><h3>Active suppliers</h3>{suppliers.length?suppliers.map(s=><div className="supplier-row" key={s.id}><span><b>{s.name}</b><small>{[s.phone,s.email,s.taxNumber].filter(Boolean).join(" · ")||"No contact details"}</small></span><button className="table-action danger-action" disabled={supplierBusy} onClick={()=>archiveSupplier(s.id,s.name)}>Archive</button></div>):<p className="muted">No suppliers yet.</p>}</div></section></div>}</Page>
}

function PurchasingV2({products,notify}:{products:Product[];notify:(x:string)=>void}){
  const [suppliers,setSuppliers]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]),[selectedSupplier,setSelectedSupplier]=useState(""),[line,setLine]=useState({productId:products[0]?.id||"",quantity:1,unitCost:Number(products[0]?.costPrice||0)}),[lines,setLines]=useState<any[]>([]),[busy,setBusy]=useState(false);
  const load=async()=>{try{const [s,o]=await Promise.all([getSuppliers(),getPurchaseOrders()]);setSuppliers(s);setOrders(o);setSelectedSupplier(current=>current&&s.some((x:any)=>x.id===current)?current:(s[0]?.id||""))}catch(e){notify(e instanceof Error?e.message:"Purchasing data could not be loaded")}};
  useEffect(()=>{void load()},[]);useEffect(()=>{if(!line.productId&&products[0])setLine(x=>({...x,productId:products[0].id,unitCost:Number(products[0].costPrice||0)}))},[products,line.productId]);
  const orderTotal=lines.reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.unitCost||0),0);
  async function create(e:FormEvent){e.preventDefault();if(!selectedSupplier||!lines.length){notify("Choose a supplier and add at least one item");return}setBusy(true);try{await savePurchaseOrder({supplierId:selectedSupplier,branchId:null,orderedDate:new Date().toISOString().slice(0,10),expectedDate:null,notes:"Created from purchasing workspace",lines});setLines([]);await load();dispatchEvent(new Event("thebarcode:data-changed"));notify("Purchase order saved")}catch(e){notify(e instanceof Error?e.message:"Purchase order could not be saved")}finally{setBusy(false)}}
  async function receive(order:any){const remaining=order.lines.filter((x:any)=>x.quantityReceived<x.quantityOrdered);if(!remaining.length){notify("This order is already fully received");return}const first=remaining[0],quantity=Number(prompt(`Receive quantity for ${first.productName}`,String(first.quantityOrdered-first.quantityReceived)));if(!Number.isFinite(quantity)||quantity<=0)return;try{await receivePurchaseOrder(order.id,{notes:"Received from purchasing workspace",deviceId:localStorage.getItem("device_id"),lines:[{lineId:first.id,quantity,unitCost:first.unitCost}]});await load();dispatchEvent(new Event("thebarcode:data-changed"));notify("Receipt recorded; stock and cost updated")}catch(e){notify(e instanceof Error?e.message:"Purchase receipt could not be recorded")}}
  return <Page><Intro title="Purchasing" text="Suppliers, purchase orders and goods received update inventory and weighted cost together."/><Panel title="New purchase order"><form className="inline-form purchasing-order-form" onSubmit={create}><SearchableSelect value={selectedSupplier} onChange={setSelectedSupplier} options={suppliers.map(s=>({value:s.id,label:s.name}))} placeholder="Search suppliers…" ariaLabel="Search suppliers"/><SearchableSelect value={line.productId} onChange={productId=>{const p=products.find(x=>x.id===productId);setLine({...line,productId,unitCost:Number(p?.costPrice||0),quantity:p?.trackingMode==="Discrete"?Math.max(1,Math.ceil(Number(line.quantity)||1)):line.quantity})}} options={products.filter(x=>x.active).map(p=>({value:p.id,label:`${p.name} · ${p.unit}`}))} placeholder="Search items…" ariaLabel="Search purchase items"/><input type="number" min={products.find(p=>p.id===line.productId)?.trackingMode==="Discrete"?"1":"0.001"} step={products.find(p=>p.id===line.productId)?.trackingMode==="Discrete"?"1":"0.001"} value={line.quantity} onChange={e=>setLine({...line,quantity:Number(e.target.value)})}/><input type="number" min="0" step="0.01" value={line.unitCost} onChange={e=>setLine({...line,unitCost:Number(e.target.value)})}/><button type="button" className="secondary-button" onClick={()=>{if(line.productId&&line.quantity>0)setLines(current=>[...current.filter(x=>x.productId!==line.productId),line])}}>Add item</button><button type="submit" disabled={busy}>Save order ({lines.length})</button></form>{lines.length>0&&<p className="muted">{lines.map(x=>`${products.find(p=>p.id===x.productId)?.name||"Item"} × ${x.quantity}`).join(" · ")} · Total {money(orderTotal)}</p>}</Panel><Panel title="Purchase orders"><Table heads={["Number","Supplier","Status","Total","Ordered","Action"]} rows={orders.map(o=>[o.number,o.supplierName,o.status,money(o.total),String(o.orderedDate),<button className="table-action" disabled={o.status==="Received"||o.status==="Cancelled"} onClick={()=>void receive(o)}>Receive</button>])}/></Panel></Page>
}
function Stocktake({products,user,notify}:{products:Product[];user:any;notify:(x:string)=>void}){
  products=products.map(p=>({...p,unit:productMeasure(p)?`${p.unit} · ${productMeasure(p)}`:p.unit}));
  const [rows,setRows]=useState<any[]>([]),[expiring,setExpiring]=useState<any[]>([]),[name,setName]=useState("Monthly stocktake"),[counts,setCounts]=useState<Record<string,number>>({}),[wastage,setWastage]=useState({productId:products[0]?.id||"",quantity:1,lotNumber:"",reason:"Spoilage"}),[busy,setBusy]=useState(false);
  const load=async()=>{try{const [s,e]=await Promise.all([getStocktakes(),getExpiringLots(30)]);setRows(s);setExpiring(e)}catch(e){notify(e instanceof Error?e.message:"Stocktake data could not be loaded")}};useEffect(()=>{void load()},[]);useEffect(()=>{if(!wastage.productId&&products[0])setWastage(x=>({...x,productId:products[0].id}))},[products,wastage.productId]);
  async function save(e:FormEvent){e.preventDefault();const lines=products.filter(p=>p.active).map(p=>({productId:p.id,countedQuantity:Number.isFinite(counts[p.id])?counts[p.id]:p.stock,lotNumber:null,expiryDate:null,notes:null}));setBusy(true);try{await saveStocktake({name,countDate:new Date().toISOString().slice(0,10),lines});setCounts({});await load();notify("Stocktake saved as open; submit it for approval")}catch(e){notify(e instanceof Error?e.message:"Stocktake could not be saved")}finally{setBusy(false)}}
  async function submit(id:string){try{await submitStocktake(id);await load();dispatchEvent(new Event("thebarcode:data-changed"));notify("Stocktake submitted for owner approval")}catch(e){notify(e instanceof Error?e.message:"Stocktake could not be submitted")}}
  async function approve(id:string,approve:boolean){try{await approveStocktake(id,{approve,reason:approve?"Approved from stocktake workspace":"Rejected from stocktake workspace",deviceId:localStorage.getItem("device_id")});await load();dispatchEvent(new Event("thebarcode:data-changed"));notify(approve?"Stocktake approved; inventory adjusted and audited":"Stocktake rejected")}catch(e){notify(e instanceof Error?e.message:"Stocktake approval failed")}}
  async function waste(e:FormEvent){e.preventDefault();try{await recordWastage({...wastage,quantity:Number(wastage.quantity),lotNumber:wastage.lotNumber||null,deviceId:localStorage.getItem("device_id")});setWastage(x=>({...x,quantity:1,lotNumber:""}));await load();dispatchEvent(new Event("thebarcode:data-changed"));notify("Wastage recorded; stock, lot quantity and audit trail updated")}catch(e){notify(e instanceof Error?e.message:"Wastage could not be recorded")}}
  return <Page><Intro title="Stocktake & lots" text="Count inventory, approve variances, and track expiry by lot without allowing negative stock."/><div className="spec-two"><Panel title="Start a stocktake"><form className="inline-form" onSubmit={save}><input value={name} onChange={e=>setName(e.target.value)} placeholder="Stocktake name" required/><button disabled={busy}>Save current counts</button></form><div className="stocktake-grid">{products.filter(p=>p.active).map(p=><label key={p.id}><span><b>{p.name}</b><small>{p.unit} · expected {p.stock}</small></span><input type="number" min="0" step={p.trackingMode==="Discrete"?"1":"0.001"} value={counts[p.id]??p.stock} onChange={e=>setCounts(x=>({...x,[p.id]:Number(e.target.value)}))}/></label>)}</div></Panel><Panel title="Record wastage / spoilage"><form className="settings-fields" onSubmit={waste}><label className="spec-field">Item<select value={wastage.productId} onChange={e=>{const productId=e.target.value,product=products.find(p=>p.id===productId);setWastage({...wastage,productId,quantity:product?.trackingMode==="Discrete"?Math.max(1,Math.ceil(Number(wastage.quantity)||1)):wastage.quantity})}}>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · available {p.stock}</option>)}</select></label><label className="spec-field">Quantity<input type="number" min={products.find(p=>p.id===wastage.productId)?.trackingMode==="Discrete"?"1":"0.001"} step={products.find(p=>p.id===wastage.productId)?.trackingMode==="Discrete"?"1":"0.001"} value={wastage.quantity} onChange={e=>setWastage({...wastage,quantity:Number(e.target.value)})}/></label><label className="spec-field">Lot number (optional)<input value={wastage.lotNumber} onChange={e=>setWastage({...wastage,lotNumber:e.target.value})}/></label><label className="spec-field">Reason<input value={wastage.reason} onChange={e=>setWastage({...wastage,reason:e.target.value})} required/></label><button>Record wastage</button></form></Panel></div><div className="spec-two"><Panel title="Stocktake sessions"><Table heads={["Name","Date","Status","Action"]} rows={rows.map(x=>[x.name,String(x.countDate),x.status,<span className="button-row"><button className="table-action" disabled={x.status!=="Open"} onClick={()=>submit(x.id)}>Submit</button><button className="table-action" disabled={x.status!=="Submitted"||!canAccess(user,"approvals")} onClick={()=>approve(x.id,true)}>Approve</button></span>])}/></Panel><Panel title="Lots expiring in 30 days"><Table heads={["Lot","Product","Expiry","Qty"]} rows={expiring.map(x=>[x.lotNumber,products.find(p=>p.id===x.productId)?.name||"Item",String(x.expiryDate),x.quantity])}/></Panel></div></Page>
}
