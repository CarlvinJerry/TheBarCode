import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
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
  printReceiptText,
  testReceiptText,
  defaultOrganizationSettings,
  defaultReceiptSettings,
  buildSaleReceipt,
  cachedOrganizationSettings,
  type OrganizationSettings,
  type ReceiptSettings,
} from "./receiptPrinter";
import { APP_CHANNEL, APP_VERSION, RELEASE_NOTES } from "./version";
import { displayScales, saveDisplayScale, storedDisplayScale, type DisplayScaleName } from "./displayScale";
import {
  bootstrap,
  bulkImportProducts,
  createProduct,
  createStaff,
  updateStaffPermissions,
  getAudit,
  getCustomerSummary,
  getProductionExpenses,
  createProductionExpense,
  payExpense,
  approveExpense,
  updateExpense,
  getInsights,
  getInsightsSettings,
  getMaintenanceBackups,
  createMaintenanceBackup,
  purgeLiveData,
  getOperationalOverview,
  saveIndustryConfiguration,
  getModules,
  getRecipes,
  createRecipe,
  getProductionRuns,
  createProductionRun,
  getProductImportBatches,
  getStaff,
  getSettings,
  getBills,
  getBillApprovals,
  payBill,
  postBill,
  cancelBill,
  refundBill,
  reverseProductImport,
  updateBill,
  requestBillApproval,
  resolveBillApproval,
  updateProduct,
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
  getAccountingOverview,
  getAccountingTrialBalance,
  getAccountingJournals,
} from "./api";
const canAccess=(user:any,key:string)=>user?.role==="Owner"||user?.permissions?.includes(key)||((({Manager:["reports","approvals","accounting","audit","expenses","inventory"],Auditor:["reports","audit","accounting"],Storekeeper:["inventory"],Cashier:["sales","expenses"]} as Record<string,string[]>)[user?.role]||[]).includes(key));
import { categoryLabel, enabledModules, industryProfiles, profileFor } from "./industryProfiles";
import {
  db,
  queueCustomer,
  queueStockMovement,
  removeLocalDemo,
  purgeLocalLiveData,
  type Product,
} from "./db";
const money = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;
type Props = {
  view: string;
  products: Product[];
  user: { id: string; name: string; role: string };
  notify: (x: string) => void;
  navigate: (x: string) => void;
};
export function Management({ view, products, user, notify, navigate }: Props) {
  if (view === "Dashboard") return <Dashboard products={products} navigate={navigate} />;
  if (view === "Bills") return <Bills products={products} user={user} notify={notify} />;
  if (view === "Inventory")
    return <Inventory products={products} user={user} notify={notify} />;
  if (view === "Customers") return <Customers notify={notify} />;
  if (view === "Expenses" || view === "Expense") return <Expenses user={user} notify={notify} />;
  if (view === "Production") return <Production products={products} user={user} notify={notify} />;
  if (view === "Accounting") return <Accounting user={user} />;
  if (view === "Reports") return <Reports user={user} />;
  if (view === "Smart Insights" || view === "Smart insights") return <SmartInsights user={user} />;
  if (view === "Audit" || view === "Audit trail") return <Audit user={user} />;
  if (["Staff", "Users & roles", "Staff & roles", "Staff & Roles"].includes(view))
    return <Staff notify={notify} />;
  if (view === "Item Setup" || view === "Item setup") return <ItemSetup products={products} user={user} notify={notify} />;
  return <Settings user={user} notify={notify} />;
}
function Dashboard({ products,navigate }: { products: Product[]; navigate:(x:string)=>void }) {
  const [overview, setOverview] = useState<any>(null);
  useEffect(() => {
    const to = new Date(),
      from = new Date(Date.now() - 6 * 86400000);
    const load=()=>getOperationalOverview(from.toISOString().slice(0,10),to.toISOString().slice(0,10)).then(setOverview).catch(() => 0);void load();const timer=setInterval(load,15000);return()=>clearInterval(timer);
  }, []);
  const daily = (overview?.daily ?? []).map((d:any)=>({day:new Date(d.date).toLocaleDateString("en",{weekday:"short"}),revenue:d.revenue,profit:d.profit}));
  const margin=overview?.revenue ? overview.grossProfit/overview.revenue*100 : 0;
  return (
    <Page>
      <Kpis onSelect={(label)=>{localStorage.setItem("bill_filter",label.includes("credit")?"Pending":label.includes("sales")?"All":"Held");navigate(label.includes("stock")?"Inventory":label.includes("credit")?"Bills":label.includes("sales")?"Bills":"Inventory")}}
        items={[
          ["Today’s sales", money(overview?.todayRevenue ?? 0), `${overview?.salesCount ?? 0} sales in range`],
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
function Bills({products,user,notify}:{products:Product[];user:{id:string;name:string;role:string};notify:(x:string)=>void}){
  const customers=useLiveQuery(()=>db.customers.toArray(),[])??[];
  const [status,setStatus]=useState(localStorage.getItem("bill_filter")||"Pending"),[rows,setRows]=useState<any[]>([]),[selected,setSelected]=useState<any>(),[lines,setLines]=useState<any[]>([]),[payment,setPayment]=useState({method:"Cash",amount:0,reference:""}),[addProductId,setAddProductId]=useState(""),[productSearch,setProductSearch]=useState(""),[pendingApproval,setPendingApproval]=useState(false),[creditOpen,setCreditOpen]=useState(false),[newCustomer,setNewCustomer]=useState({name:"",phone:"",creditLimit:0}),[approvals,setApprovals]=useState<any[]>([]);
  const canApprove=["Owner","Manager"].includes(user.role);const load=async()=>{try{const [loaded,approvalRows]=await Promise.all([getBills(status),canApprove?getBillApprovals():Promise.resolve([])]);setRows(loaded);setApprovals(approvalRows as any[]);const focus=localStorage.getItem("bill_focus");if(focus){const match=loaded.find((x:any)=>x.id===focus);if(match)open(match);localStorage.removeItem("bill_focus")}}catch{setRows([])}};useEffect(()=>{localStorage.removeItem("bill_filter");void load()},[status]);
  const open=(x:any)=>{setSelected(x);setPendingApproval(Boolean(x.revisions?.some((r:any)=>r.action==="ApprovalRequested")));setProductSearch("");setLines(x.items.map((i:any)=>({productId:i.productId,productName:i.productName,quantity:Number(i.quantity),unitPrice:Number(i.unitPrice),discount:Number(i.discount||0)})));setPayment({method:"Cash",amount:Number(x.balance||0),reference:""})};
  const revisionPayload=(customerId?:string)=>({customerId:customerId||selected.customerId,discount:selected.discount||0,notes:selected.notes,reason:"Held bill change requested from bill workspace",deviceId:localStorage.getItem("device_id"),expectedRevision:selected.revision,items:lines.map(x=>({productId:x.productId,quantity:x.quantity,unitPrice:x.unitPrice,discount:x.discount||0}))});
  const saveHeld=async()=>{const payload=revisionPayload();const lowers=lines.reduce((s,x)=>s+x.quantity*x.unitPrice-x.discount,0)<Number(selected.total);try{if(lowers&&!canApprove){await requestBillApproval(selected.id,payload);setSelected(undefined);notify(`Bill #${selected.receiptNumber} is now Pending Approval`);dispatchEvent(new Event("dukora:attention"));await load();return}const saved=await updateBill(selected.id,payload);setSelected(undefined);setPendingApproval(false);notify(`Bill #${saved.receiptNumber} revision ${saved.revision} saved across bills, stock checks and reports`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Owner or manager approval is required")}};
  const resolveApproval=async(item:any,approve:boolean)=>{const reason=prompt(`${approve?"Approve":"Reject"} change to bill #${item.receiptNumber}: reason`);if(!reason)return;try{await resolveBillApproval(item.id,{approve,reason,deviceId:localStorage.getItem("device_id")});notify(`Bill #${item.receiptNumber} change ${approve?"approved":"rejected"}`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Approval could not be completed")}};
  const post=async(kind:"Paid"|"Credit",customerId?:string,paidMethod:"Cash"|"M-Pesa"="Cash")=>{if(kind==="Credit"&&!customerId&&!selected.customerId){setCreditOpen(true);return}try{const revised=await updateBill(selected.id,{...revisionPayload(customerId),reason:"Final bill revision before posting"});const method=kind==="Paid"?paidMethod:"Credit";const posted=await postBill(revised.id,{status:kind,method,amountPaid:kind==="Paid"?revised.total:0,dueAt:kind==="Credit"?new Date(Date.now()+7*86400000).toISOString():undefined,notes:"Posted from bill workspace",deviceId:localStorage.getItem("device_id")});setCreditOpen(false);open({...posted,customerName:selected.customerName||revised.customerName,cashierName:selected.cashierName||revised.cashierName});notify(`${kind} bill posted via ${kind==="Paid"?method:"customer credit"}; choose Print ${kind} Bill below if a receipt is required`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Bill could not be posted")}};
  const addLine=()=>{const p=products.find(x=>x.id===addProductId);if(!p)return;setLines(current=>{const existing=current.find(x=>x.productId===p.id);if(existing&&existing.quantity>=p.stock){notify(`${p.name} is limited to ${p.stock} available units`);return current}return existing?current.map(x=>x.productId===p.id?{...x,quantity:Math.min(p.stock,x.quantity+1)}:x):[...current,{productId:p.id,productName:p.name,quantity:1,unitPrice:p.sellingPrice,discount:0}]});setAddProductId("")};
  const removeLine=(productId:string)=>{if(lines.length===1){notify("A held bill must retain at least one item; cancel the bill instead");return}setLines(current=>current.filter(x=>x.productId!==productId));notify(canApprove?"Item removed from the draft; save the revision to apply it":"Item marked for removal; save the revision to request approval")};
  const refreshSelected=async()=>{const current=(await getBills("All")).find((x:any)=>x.id===selected.id);if(!current){setSelected(undefined);return}open(current);notify(`Bill #${current.receiptNumber} refreshed to revision ${current.revision}`)};
  const chooseCreditCustomer=(customer:any)=>{setCreditOpen(false);void post("Credit",customer.id)};
  const createCreditCustomer=async(e:FormEvent)=>{e.preventDefault();const customer={id:crypto.randomUUID(),...newCustomer,notes:"Created while posting credit bill"};await queueCustomer(customer);await syncOutbox();chooseCreditCustomer(customer)};
  const recordPayment=async()=>{try{const saved=await payBill(selected.id,{...payment,deviceId:localStorage.getItem("device_id")});setSelected(undefined);notify(`Payment recorded; balance ${money(saved.balance)}`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Payment could not be recorded")}};
  const cancel=async()=>{const reason=prompt("Owner/manager cancellation reason");if(!reason)return;try{await cancelBill(selected.id,reason,localStorage.getItem("device_id")||undefined);setSelected(undefined);notify("Held bill cancelled with audit record");dispatchEvent(new Event("dukora:attention"));await load()}catch{notify("Owner or manager authorization is required")}};
  const refund=async()=>{const reason=prompt("Owner/manager refund reason");if(!reason)return;try{await refundBill(selected.id,reason,localStorage.getItem("device_id")||undefined);setSelected(undefined);notify("Sale refunded; inventory and accounts reversed");dispatchEvent(new Event("dukora:attention"));await load()}catch{notify("Owner or manager authorization is required")}};
  const print=async()=>{try{let bill=selected;if(selected.status==="Held")bill=await updateBill(selected.id,{...revisionPayload(),reason:"Revision saved before unpaid printing"});const credit=bill.status!=="Paid",receiptStatus=bill.status==="Held"||bill.status==="PendingApproval"?"UNPAID":bill.status==="Paid"?"PAID":"CREDIT";const text=buildSaleReceipt({id:String(bill.receiptNumber),customerName:bill.customerName||selected.customerName||"Walk-in customer",cashierName:bill.cashierName||selected.cashierName||user.name,method:bill.payments?.at(-1)?.method||"Unpaid",status:receiptStatus,credit,items:bill.items.map((x:any)=>({name:x.productName,quantity:Number(x.quantity),unitPrice:Number(x.unitPrice)})),total:Number(bill.total)});await printReceiptText(bill.status==="Held"||bill.status==="PendingApproval"?`${text}\nREVISION: ${bill.revision}`:text);setSelected(undefined);notify(`Revision ${bill.revision} saved and ${receiptStatus} receipt sent to the configured printer`);dispatchEvent(new Event("dukora:attention"));await load()}catch(e){notify(e instanceof Error?e.message:"Bill could not be validated and printed")}};
  const totals={held:rows.filter(x=>x.status==="Held").length,credit:rows.filter(x=>x.status==="Credit"||x.status==="PartiallyPaid").reduce((s,x)=>s+Number(x.balance),0),overdue:rows.filter(x=>x.dueAt&&new Date(x.dueAt)<new Date()&&x.balance>0).length};
  return <Page><Intro title="Bills & payment follow-up" text="Open, revise, post and collect against the complete live bill register."/>
    <Filter>{["All","Pending","PendingApproval","Held","Credit","PartiallyPaid","Paid","Cancelled"].map(x=><button className={status===x?"active":""} onClick={()=>setStatus(x)} key={x}>{x==="PendingApproval"?"Pending approval":x}</button>)}</Filter>
    <Kpis onSelect={label=>setStatus(label==="Held bills"?"Held":label==="Outstanding"?"Credit":label==="Overdue"?"Pending":"All")} items={[["Held bills",String(totals.held),"Editable unpaid orders"],["Outstanding",money(totals.credit),"Credit and partial balances"],["Overdue",String(totals.overdue),"Past due date"],["Visible bills",String(rows.length),`Filter: ${status}`]]}/>
    {canApprove&&approvals.length>0&&<Panel title={`Held-bill approvals (${approvals.length})`}><Table heads={["Bill","Requested by","Requested change","Reason","Time","Decision"]} rows={approvals.map(x=>[`#${x.receiptNumber}`,x.requestedBy,`${x.itemCount} items · ${money(x.currentTotal)} → ${money(x.requestedTotal)}`,x.reason,new Date(x.createdAt).toLocaleString(),<span key={`approval-${x.id}`} className="button-row"><button onClick={()=>resolveApproval(x,true)}>Approve</button><button className="danger-button" onClick={()=>resolveApproval(x,false)}>Reject</button></span>])}/></Panel>}
    <Panel title="Bill register"><Table heads={["Bill","Date","Customer","Status","Total","Paid","Balance","Action"]} rows={rows.map(x=>[`#${x.receiptNumber} · r${x.revision}`,new Date(x.occurredAt).toLocaleString(),x.customerName||"Walk-in",<span key={`status-${x.id}`} className={`badge ${String(x.status).toLowerCase()}`}>{x.status}</span>,money(x.total),money(x.paid),money(x.balance),<button key={`open-${x.id}`} className="table-action" onClick={()=>open(x)}>Open</button>])}/></Panel>
    {selected&&<div className="modal bill-workspace"><section><button className="close" aria-label="Close bill" onClick={()=>setSelected(undefined)}>×</button><div className="bill-workspace-header"><span><small>Bill workspace</small><h2>Bill #{selected.receiptNumber}</h2></span><span className={`badge ${String(selected.status).toLowerCase()}`}>{selected.status}</span><p>Revision {selected.revision} · {selected.customerName||"Walk-in customer"}</p></div>
      {selected.status==="Held"&&<div className="payment-box bill-product-picker"><h3>Add another item to this held bill</h3><Field label="Search products"><input value={productSearch} placeholder="Name, category, barcode or SKU" onChange={e=>setProductSearch(e.target.value)}/></Field><Field label="Matching item"><select value={addProductId} onChange={e=>setAddProductId(e.target.value)}><option value="">Choose item…</option>{products.filter(x=>x.active&&x.sellable&&(!productSearch||`${x.name} ${x.category} ${x.barcode||""}`.toLowerCase().includes(productSearch.toLowerCase()))).map(x=><option value={x.id} key={x.id}>{x.name} · {x.packageQuantity||1} {x.packageUnit||x.unit}{x.stock<=0?" · OUT OF STOCK":""}</option>)}</select></Field><button disabled={!addProductId||Number(products.find(x=>x.id===addProductId)?.stock??0)<=0} onClick={addLine}>＋ Add item</button></div>}
      {(pendingApproval||selected.status==="PendingApproval")&&<div className="approval-notice"><b>Reduction awaiting approval</b><span>The saved bill remains unchanged until an Owner or Manager approves or rejects it.</span><button onClick={refreshSelected}>Refresh status</button></div>}
      <div className="bill-edit-lines">{lines.map((x,i)=><div key={x.productId}>{selected.status==="Held"?<button disabled={pendingApproval} className="remove-bill-line" title={`Remove ${x.productName}`} onClick={()=>removeLine(x.productId)}>×</button>:<span className="remove-bill-line-spacer" aria-hidden="true"/>}<b>{x.productName}</b><Field label="Quantity"><input type="number" min="1" max={products.find(p=>p.id===x.productId)?.stock||x.quantity} step="1" disabled={selected.status!=="Held"||pendingApproval} value={x.quantity} onChange={e=>{const max=Number(products.find(p=>p.id===x.productId)?.stock||1),requested=Math.max(1,Math.trunc(+e.target.value||1));if(requested>max)notify(`${x.productName} is limited to ${max} available units`);setLines(lines.map((v,j)=>j===i?{...v,quantity:Math.min(max,requested)}:v))}}/></Field><Field label="Price"><input type="number" min="0" disabled={selected.status!=="Held"||pendingApproval} value={x.unitPrice} onChange={e=>setLines(lines.map((v,j)=>j===i?{...v,unitPrice:+e.target.value}:v))}/></Field><strong>{money(x.quantity*x.unitPrice)}</strong></div>)}</div>
      <div className="button-row bill-workspace-actions">{selected.status==="Held"&&<><button className="secondary-button" disabled={pendingApproval} onClick={saveHeld}>Save revision</button><button disabled={pendingApproval} onClick={()=>post("Paid",undefined,"Cash")}>Post as Paid · Cash</button><button disabled={pendingApproval} onClick={()=>post("Paid",undefined,"M-Pesa")}>Post as Paid · M-Pesa</button><button className="secondary-button" disabled={pendingApproval} onClick={()=>post("Credit")}>Post as Credit</button><button className="danger-button" onClick={cancel}>Cancel</button></>}{["Paid","Credit","PartiallyPaid"].includes(selected.status)&&["Owner","Manager"].includes(user.role)&&<button className="danger-button" onClick={refund}>Refund / reverse</button>}<button className="secondary-button" onClick={print}>Print {selected.status==="Held"?"Unpaid":selected.status==="Paid"?"Paid":"Credit"} Bill</button></div>
      {(selected.status==="Credit"||selected.status==="PartiallyPaid")&&<section className="payment-box later-payment"><div className="later-payment-header"><span><small>Outstanding balance</small><h3>Record later payment</h3></span><strong>{money(selected.balance)}</strong></div><Field label="Method"><select value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Bank</option></select></Field><Field label="Amount"><input type="number" min=".01" max={selected.balance} value={payment.amount} onChange={e=>setPayment({...payment,amount:+e.target.value})}/></Field><Field label="Reference"><input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></Field><button className="primary-button" onClick={recordPayment}>Record payment</button></section>}
      <div className="bill-history"><Panel title="Immutable revision history"><Table heads={["Revision","Action","Reason","Time"]} rows={(selected.revisions||[]).map((x:any)=>[String(x.revision),x.action,x.reason,new Date(x.createdAt).toLocaleString()])}/></Panel></div>
    </section></div>}
    {creditOpen&&<div className="modal customer-modal"><section><button className="close" onClick={()=>setCreditOpen(false)}>×</button><h2>Customer required for credit</h2><p className="muted">Select an existing customer or register their details before posting this bill as credit.</p><div className="customer-list">{customers.filter(x=>x.name!=="Walk-in").map(x=><button key={x.id} onClick={()=>chooseCreditCustomer(x)}><i>{x.name[0]}</i><span><b>{x.name}</b><small>{x.phone||"No phone"} · Limit {money(x.creditLimit)}</small></span></button>)}</div><form className="customer-form" onSubmit={createCreditCustomer}><Field label="New customer name"><input required value={newCustomer.name} onChange={e=>setNewCustomer({...newCustomer,name:e.target.value})}/></Field><Field label="Phone"><input value={newCustomer.phone} onChange={e=>setNewCustomer({...newCustomer,phone:e.target.value})}/></Field><Field label="Credit limit"><input type="number" min="0" value={newCustomer.creditLimit} onChange={e=>setNewCustomer({...newCustomer,creditLimit:+e.target.value})}/></Field><button>Register and Post as Credit</button></form></section></div>}
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
  const canMove=["Owner","Manager","Storekeeper"].includes(user.role);
  const [open, setOpen] = useState(false),
    [riskOpen,setRiskOpen]=useState(false),
    [overview,setOverview]=useState<any>(null),
    [form, setForm] = useState({
      productId: products[0]?.id ?? "",
      type: "Restock",
      quantity: 1,
      notes: "",
    });
  useEffect(() => {
    if (!form.productId && products[0])
      setForm((x) => ({ ...x, productId: products[0].id }));
  }, [products, form.productId]);
  useEffect(()=>{const end=new Date(),start=new Date();start.setDate(start.getDate()-29);getOperationalOverview(start.toISOString().slice(0,10),end.toISOString().slice(0,10)).then(setOverview).catch(()=>setOverview(null))},[products]);
  const stockRisks:any[]=overview?.lowStock??products.filter(x=>x.stock<=x.minStock*1.5).map(x=>({...x,belowMinimum:x.stock<=x.minStock,daysRemaining:null,dailyUse:0}));
  const chart = Object.values(products.reduce((a:any,x)=>{a[x.category]??={name:x.category,value:0};a[x.category].value+=x.stock*x.costPrice;return a},{})).map((x:any)=>({...x,label:money(x.value)}));
  async function save(e: FormEvent) {
    e.preventDefault();
    const sign = form.type === "Restock" ? 1 : -1;
    await queueStockMovement({
      movementId: crypto.randomUUID(),
      productId: form.productId,
      staffId: user.id,
      type: form.type,
      quantityChange: Math.abs(form.quantity) * sign,
      notes: form.notes,
      deviceId: "windows-pos-01",
    });
    const synced=await syncOutbox().catch(() => 0);if(synced>0)await bootstrap().catch(()=>0);dispatchEvent(new Event("dukora:attention"));
    setOpen(false);
    notify(synced>0?"Stock movement saved and stock totals refreshed":"Stock movement saved locally and queued for sync");
  }
  return (
    <Page>
      <Intro
        title="Stock overview"
        text="Bar, café, kitchen and food stock with pending updates included."
        action={canMove?"＋ Stock movement":undefined}
        onAction={canMove?() => setOpen(true):undefined}
      />
      {!canMove&&<p className="muted access-hint">Stock movements require Owner, Manager or Storekeeper access. Ask an authorized user to record the adjustment.</p>}
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
                <select
                  value={form.productId}
                  onChange={(e) =>
                    setForm({ ...form, productId: e.target.value })
                  }
                >
                  {products.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name} · {x.stock} available
                    </option>
                  ))}
                </select>
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
              <label>
                Quantity
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: +e.target.value })
                  }
                />
              </label>
              <label>
                Reason / notes
                <input
                  required
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <button>Save movement</button>
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
            String(x.stock),
            String(x.minStock),
            money(x.costPrice),
            money(x.sellingPrice),
            stockRisks.some(r=>r.id===x.id) ? (x.stock<=x.minStock?"Low":"Projected low") : "Healthy",
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
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit customer</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Phone"><input value={editing.phone||""} onChange={e=>setEditing({...editing,phone:e.target.value})}/></Field><Field label="Credit limit"><input type="number" min="0" value={editing.creditLimit} onChange={e=>setEditing({...editing,creditLimit:+e.target.value})}/></Field><Field label="Notes"><input value={editing.notes||""} onChange={e=>setEditing({...editing,notes:e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label><button>Save controlled change</button></form></section></div>}
    </Page>
  );
}
function Production({products,user,notify}:{products:Product[];user:{role:string};notify:(x:string)=>void}) {
  const industry=profileFor(cachedOrganizationSettings().industryProfile);
  const [modules,setModules]=useState<any>();const [recipes,setRecipes]=useState<any[]>([]),[runs,setRuns]=useState<any[]>([]),[adding,setAdding]=useState(false),[running,setRunning]=useState<any>();
  const [form,setForm]=useState<any>({productId:"",name:"",yieldQuantity:1,notes:"",ingredients:[{productId:"",quantity:1,wastePercent:0}]});const [run,setRun]=useState({quantity:1,notes:""});
  const load=async()=>{const [m,r,p]=await Promise.all([getModules(),getRecipes(),getProductionRuns()]);setModules(m);setRecipes(r);setRuns(p)};useEffect(()=>{void load().catch(e=>notify(e instanceof Error?e.message:"Production data could not be loaded"))},[]);
  const canManage=["Owner","Manager","Storekeeper"].includes(user.role);const active=products.filter(x=>x.active);const ingredients=active;
  function updateIngredient(index:number,key:string,value:any){setForm({...form,ingredients:form.ingredients.map((x:any,i:number)=>i===index?{...x,[key]:value}:x)})}
  async function saveRecipe(e:FormEvent){e.preventDefault();try{await createRecipe({...form,yieldQuantity:+form.yieldQuantity,ingredients:form.ingredients.map((x:any)=>({productId:x.productId,quantity:+x.quantity,wastePercent:+x.wastePercent}))});setAdding(false);setForm({productId:"",name:"",yieldQuantity:1,notes:"",ingredients:[{productId:"",quantity:1,wastePercent:0}]});await load();notify("Recipe saved as a controlled new version")}catch(e){notify(e instanceof Error?e.message:"Recipe could not be saved")}}
  async function completeRun(e:FormEvent){e.preventDefault();try{const result=await createProductionRun({recipeId:running.id,quantity:+run.quantity,notes:run.notes,deviceId:localStorage.getItem("device_id")||"production-ui"});setRunning(undefined);setRun({quantity:1,notes:""});await bootstrap();await load();dispatchEvent(new Event("dukora:attention"));notify(`Production completed · ${result.quantityProduced} units · ${money(result.totalCost)} cost`)}catch(e){notify(e instanceof Error?e.message:"Production run could not be completed")}}
  return <Page><Intro title={industry.productionLabel} text={`${industry.productionHelp} Every transaction updates ${industry.inputLabel.toLowerCase()}, output stock, costing and audit history.`}/>
    <Kpis items={[["Active recipes",String(recipes.filter(x=>x.active).length),"Version controlled"],["Completed runs",String(runs.length),"Latest 250"],["Production cost",money(runs.reduce((n,x)=>n+Number(x.totalCost),0)),"Recorded material cost"],["Access mode",modules?.mode||"Loading",modules?.package||"All features"]]}/>
    <div className="button-row">{canManage&&<button onClick={()=>setAdding(true)}>+ New recipe</button>}<small className="muted">All completed modules are visible during Open Preview testing. Destructive and approval permissions remain role-controlled.</small></div>
    <Panel title={`Active ${industry.productionLabel.toLowerCase()} definitions`}><Table heads={["Output","Definition","Yield",industry.inputLabel,"Material cost","Version","Action"]} rows={recipes.filter(x=>x.active).map(x=>[x.productName,x.name,x.yieldQuantity,x.ingredients.map((i:any)=>`${i.quantity} ${i.unit||"unit"} ${i.productName}${i.wastePercent?` + ${i.wastePercent}%`:""}`).join(" · "),money(x.costPerYield),`v${x.version}`,canManage?<button key={`run-${x.id}`} className="table-action" onClick={()=>setRunning(x)}>Record transaction</button>:"View only"])}/>{!recipes.some(x=>x.active)&&<p className="muted">No definition yet. Create the required {industry.inputLabel.toLowerCase()} and output item in Item Setup, then define their relationship here.</p>}</Panel>
    <Panel title="Production history"><Table heads={["Completed","Output","Quantity","Material cost","Status","Notes"]} rows={runs.map(x=>[new Date(x.occurredAt).toLocaleString(),x.productName,String(x.quantityProduced),money(x.totalCost),x.status,x.notes||"—"])}/></Panel>
    {adding&&<div className="modal record-editor"><section><button className="close" onClick={()=>setAdding(false)}>×</button><h2>New controlled definition</h2><form className="item-form" onSubmit={saveRecipe}><Field label="Output item"><select required value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})}><option value="">Choose output item</option>{active.map(x=><option key={x.id} value={x.id}>{x.name} · {x.unit}</option>)}</select></Field><Field label="Definition name"><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Output yield"><input required type="number" min=".001" step=".001" value={form.yieldQuantity} onChange={e=>setForm({...form,yieldQuantity:+e.target.value})}/></Field>{form.ingredients.map((row:any,index:number)=><div className="recipe-line" key={index}><Field label={`${industry.inputLabel} ${index+1}`}><select required value={row.productId} onChange={e=>updateIngredient(index,"productId",e.target.value)}><option value="">Choose {industry.inputLabel.toLowerCase()}</option>{ingredients.filter(x=>x.id!==form.productId).map(x=><option key={x.id} value={x.id}>{x.name} · {x.stock} {x.unit}</option>)}</select></Field><Field label="Quantity per yield"><input required type="number" min=".001" step=".001" value={row.quantity} onChange={e=>updateIngredient(index,"quantity",+e.target.value)}/></Field><Field label="Waste %"><input type="number" min="0" step=".01" value={row.wastePercent} onChange={e=>updateIngredient(index,"wastePercent",+e.target.value)}/></Field>{form.ingredients.length>1&&<button type="button" className="table-action" onClick={()=>setForm({...form,ingredients:form.ingredients.filter((_:any,i:number)=>i!==index)})}>Remove</button>}</div>)}<button type="button" className="outline-button" onClick={()=>setForm({...form,ingredients:[...form.ingredients,{productId:"",quantity:1,wastePercent:0}]})}>+ {industry.inputLabel}</button><Field label="Transaction notes"><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field><button>Save controlled version</button></form></section></div>}
    {running&&<div className="modal record-editor"><section><button className="close" onClick={()=>setRunning(undefined)}>×</button><h2>Record {industry.productionLabel.toLowerCase()} · {running.productName}</h2><p>{industry.inputLabel} stock will be deducted and output stock added atomically. The operation cannot partially save.</p><form className="item-form" onSubmit={completeRun}><Field label="Output quantity"><input required type="number" min=".001" step=".001" value={run.quantity} onChange={e=>setRun({...run,quantity:+e.target.value})}/></Field><Field label="Batch / transaction notes"><input value={run.notes} onChange={e=>setRun({...run,notes:e.target.value})}/></Field><button>Complete stock transaction</button></form></section></div>}
  </Page>
}
function Expenses({user,notify}:{user:{role:string},notify:(x:string)=>void}) {
  const today=new Date().toISOString().slice(0,10), month=new Date();month.setDate(1);
  const blank={date:today,category:"Inventory",description:"",amount:0,initiallyPaid:0,method:"Cash",payee:"",reference:"",dueDate:"",taxAmount:0,notes:"",recurring:false};
  const [category, setCategory] = useState("All"),[status,setStatus]=useState("All"),[from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[rows,setRows]=useState<any[]>([]),[adding,setAdding]=useState(false),[form,setForm]=useState(blank),[paying,setPaying]=useState<any>(),[payment,setPayment]=useState({amount:0,method:"Cash",reference:"",notes:""}),[editing,setEditing]=useState<any>();
  const canAdd=["Owner","Manager","Cashier","Storekeeper"].includes(user.role),canManage=["Owner","Manager"].includes(user.role);
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
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit expense</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Expense date"><input required type="date" value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value})}/></Field><Field label="Category"><input required value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></Field><Field label="Description"><input required value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></Field><Field label="Amount"><input required type="number" min={editing.paidAmount||0.01} step="0.01" value={editing.amount} onChange={e=>setEditing({...editing,amount:+e.target.value})}/></Field><Field label="Payment method"><select required value={editing.method} onChange={e=>setEditing({...editing,method:e.target.value})}>{["Cash","M-Pesa","Bank","Credit","Other"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Supplier / payee"><input value={editing.payee||""} onChange={e=>setEditing({...editing,payee:e.target.value})}/></Field><Field label="Reference"><input value={editing.reference||""} onChange={e=>setEditing({...editing,reference:e.target.value})}/></Field><Field label="Due date"><input type="date" value={editing.dueDate||""} onChange={e=>setEditing({...editing,dueDate:e.target.value})}/></Field><Field label="Tax"><input type="number" min="0" value={editing.taxAmount||0} onChange={e=>setEditing({...editing,taxAmount:+e.target.value})}/></Field><Field label="Notes"><input value={editing.notes||""} onChange={e=>setEditing({...editing,notes:e.target.value})}/></Field><Field label="Reason for change"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><label><input type="checkbox" checked={editing.recurring} onChange={e=>setEditing({...editing,recurring:e.target.checked})}/> Recurring</label><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label><button>Save controlled change</button></form></section></div>}
    </Page>
  );
}
function Accounting({user}:{user:{role:string}}) {
  const today=new Date().toISOString().slice(0,10),month=new Date();month.setDate(1);const [from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[data,setData]=useState<any>(),[trial,setTrial]=useState<any[]>([]),[journals,setJournals]=useState<any[]>([]),[busy,setBusy]=useState(false);
  const permitted=["Owner","Manager","Auditor"].includes(user.role);const load=async()=>{if(!permitted)return;setBusy(true);try{const [overview,tb,je]=await Promise.all([getAccountingOverview(from,to),getAccountingTrialBalance(from,to),getAccountingJournals(from,to)]);setData(overview);setTrial(tb);setJournals(je)}catch{}finally{setBusy(false)}};useEffect(()=>{void load()},[from,to,permitted]);
  if(!permitted)return <Page><Intro title="Accounting" text="Ledger and financial statements are protected by role."/><Panel title="Restricted access"><p>Accounting is available to Owners, Managers and Auditors.</p></Panel></Page>;
  return <Page><Intro title="Accounting" text="Live financial position from sales, payments, inventory and approved expenses." action={busy?"Refreshing…":"Refresh"} onAction={()=>void load()}/><Filter><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><span>to</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></Filter><Kpis items={[["Revenue",money(data?.revenue||0),`${data?.salesCount||0} posted sales`],["Gross profit",money(data?.grossProfit||0),"Revenue less cost of goods"],["Net profit",money(data?.netProfit||0),"After approved expenses"],["Receivables",money(data?.receivables||0),"Customer credit outstanding"]]}/><Two><Panel title="Financial position"><Table heads={["Measure","Amount"]} rows={[["Revenue",money(data?.revenue||0)],["Cost of goods sold",money(data?.cost||0)],["Operating expenses",money(data?.expenses||0)],["Cash collected",money(data?.collected||0)],["Accounts receivable",money(data?.receivables||0)],["Accounts payable",money(data?.payables||0)]]}/></Panel><Panel title="Trial balance"><Table heads={["Account","Type","Debit","Credit"]} rows={trial.map(x=>[`${x.code} · ${x.name}`,x.type,money(x.debit),money(x.credit)])}/></Panel></Two><Panel title="Posted journal entries"><Table heads={["Date","Source","Memo","Status","Lines"]} rows={journals.map(x=>[String(x.date),x.sourceType,x.memo,x.status,String(x.lines?.length||0)])}/></Panel></Page>;
}
function Reports({user}:{user:{role:string}}) {
  const today=new Date().toISOString().slice(0,10), month=new Date();month.setDate(1);
  const [range, setRange] = useState("This month"),[from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[summary,setSummary]=useState<any>(null),[,setDetail]=useState<any>(null),[reportBusy,setReportBusy]=useState(false);
  const permitted=["Owner","Manager","Auditor"].includes(user.role);const load=async()=>{if(!permitted)return null;setReportBusy(true);try{const d=await getOperationalOverview(from,to);setSummary(d);setDetail(d);return {summary:d,detail:d}}catch{setSummary(null);setDetail(null);return null}finally{setReportBusy(false)}};useEffect(()=>{const timer=setTimeout(()=>void load(),250);return()=>clearTimeout(timer)},[from,to,permitted]);
  const downloadLatest=async()=>{const latest=await load();if(latest)downloadPdfReport({from,to,...latest})};
  const gross=(summary?.revenue??0)-(summary?.cost??0),net=gross-(summary?.expenses??0);
  if(!permitted)return <Page><Intro title="Historical reports" text="Role-based financial access protects business-sensitive information."/><Panel title="Restricted access"><p>Full financial reports are available to Owners and Managers, with read-only access for Auditors. Cashiers use their Sell and Bills views; Storekeepers use Inventory reporting.</p></Panel></Page>;
  return (
    <Page>
      <Intro
        title="Historical reports & shift close"
        text={`${range} · Synced and on-device records included.`}
        action="Close shift"
      />
      <div className="range-tabs">
        {["Today", "This week", "This month", "Custom range"].map((x) => (
          <button
            className={range === x ? "active" : ""}
            onClick={() => setRange(x)}
            key={x}
          >
            {x}
          </button>
        ))}
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
        <span>to</span>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
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
    </Page>
  );
}

function SmartInsights({user}:{user:{role:string}}){
  const today=new Date().toISOString().slice(0,10), start=new Date();start.setDate(start.getDate()-29);
  const [from,setFrom]=useState(start.toISOString().slice(0,10)),[to,setTo]=useState(today),[data,setData]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const permitted=["Owner","Manager","Auditor"].includes(user.role);const load=()=>{if(!permitted){setError("Smart Insights is available to Owner, Manager and Auditor accounts.");return}setLoading(true);setError("");getInsights(from,to).then(setData).catch(e=>{setData(null);setError(e instanceof Error?e.message:"Smart Insights could not load")}).finally(()=>setLoading(false))};useEffect(()=>{const timer=setTimeout(load,300);return()=>clearTimeout(timer)},[from,to,permitted]);
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
  const permitted=["Owner","Manager","Auditor"].includes(user.role);
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
function Staff({ notify }: { notify: (x: string) => void }) {
  const canEditPermissions=canAccess({role:"Owner"},"staff");
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
  async function saveEdit(e:FormEvent){e.preventDefault();if(!canEditPermissions)return;try{await updateStaff(editing.id,{name:editing.name,role:editing.role,active:editing.active,newPin:editing.newPin||null,reason:editing.reason});await updateStaffPermissions(editing.id,editing.permissions||[],editing.reason);setEditing(undefined);await load();notify("Staff access updated and audited")}catch(e){notify(e instanceof Error?e.message:"Staff access could not be updated")}}
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
      <Panel title="Team & access"><Table heads={["Name","Role","Discount","Stock","Reports","Status","Action"]} rows={rows.map(x=>[x.name,x.role,x.role==="Owner"||x.role==="Manager"?"Yes":"No",x.role==="Owner"||x.role==="Storekeeper"?"Yes":"No",x.role==="Owner"||x.role==="Manager"?"Yes":"No",x.active?"Active":"Inactive",<button key={`staff-${x.id}`} className="table-action" onClick={()=>setEditing({...x,permissions:typeof x.permissions==="string"?x.permissions.split(",").filter(Boolean):[],newPin:"",reason:""})}>Edit</button>])}/></Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit staff access</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Role"><select value={editing.role} onChange={e=>setEditing({...editing,role:e.target.value})}>{["Cashier","Storekeeper","Manager","Auditor","Owner"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="New PIN (optional)"><input type="password" minLength={6} value={editing.newPin} onChange={e=>setEditing({...editing,newPin:e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><fieldset><legend>Additional capabilities</legend>{[["reports","Reports"],["approvals","Bill approvals"],["accounting","Accounting"],["audit","Audit trail"],["expenses","Expenses"],["inventory","Inventory"],["staff","Staff administration"],["settings","Settings"]].map(([key,label])=><label key={key}><input type="checkbox" checked={(editing.permissions||[]).includes(key)} onChange={e=>setEditing({...editing,permissions:e.target.checked?[...(editing.permissions||[]),key]:(editing.permissions||[]).filter((x:string)=>x!==key)})}/>{label}</label>)}</fieldset><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to deactivate)</label><button>Save access change</button></form></section></div>}
    </Page>
  );
}
function ItemSetup({ products,user,notify }: {products:Product[];user:{role:string}; notify: (x: string) => void }) {
  const industry=profileFor(cachedOrganizationSettings().industryProfile),defaultCategory=industry.itemCategories[0];
  const [editing,setEditing]=useState<any>();
  const [bulkRows,setBulkRows]=useState<any[]>([]),[bulkErrors,setBulkErrors]=useState<{row:number;errors:string[]}[]>([]),[duplicatePolicy,setDuplicatePolicy]=useState("Skip"),[importing,setImporting]=useState(false),[bulkResult,setBulkResult]=useState<any>();
  const [importBatches,setImportBatches]=useState<any[]>([]);const loadBatches=()=>getProductImportBatches().then(setImportBatches).catch(()=>setImportBatches([]));useEffect(()=>{void loadBatches()},[]);
  const [form, setForm] = useState({
    name: "",
    category: defaultCategory,
    barcode: "",
    unit: "item",
    packageQuantity: 1,
    packageUnit: "item",
    trackingMode: "Discrete",
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
    try {
      const p = await createProduct(form);
      await db.products.put(p);
      setForm({name:"",category:defaultCategory,barcode:"",unit:"item",packageQuantity:1,packageUnit:"item",trackingMode:"Discrete",brand:"",supplier:"",taxRate:0,costPrice:0,sellingPrice:0,stock:0,minStock:0,sellable:true});dispatchEvent(new Event("dukora:attention"));notify("Item created successfully");
    } catch (e) {
      notify(e instanceof Error?e.message:"Item could not be created");
    }
  }
  async function saveEdit(e:FormEvent){e.preventDefault();try{const saved=await updateProduct(editing.id,{...editing,reason:editing.reason});await db.products.put(saved);setEditing(undefined);dispatchEvent(new Event("dukora:attention"));notify("Item updated with audit history")}catch(e){notify(e instanceof Error?e.message:"Item changes could not be saved")}}
  async function chooseBulkFile(file?:File){if(!file)return;try{const rows=parseProductCsv(await file.text());const errors=validateProductRows(rows);setBulkRows(rows);setBulkErrors(errors);setBulkResult(undefined);notify(errors.length?`${errors.length} rows require correction`:`${rows.length} valid rows ready to import`)}catch(e){setBulkRows([]);setBulkErrors([{row:1,errors:[e instanceof Error?e.message:"The CSV could not be read"]}])}}
  async function importBulk(){if(!bulkRows.length||bulkErrors.length)return;setImporting(true);try{const result=await bulkImportProducts({duplicatePolicy,deviceId:localStorage.getItem("device_id")||"local-terminal",rows:bulkRows});setBulkResult(result);await bootstrap();await loadBatches();dispatchEvent(new Event("dukora:attention"));notify(`Import complete · ${result.created} created · ${result.updated} updated · ${result.skipped} skipped`)}catch(e){notify(e instanceof Error?e.message:"Import failed without changing inventory")}finally{setImporting(false)}}
  async function reverseBatch(id:string){if(!confirm("Reverse this import? TheBarcode will refuse if any later sale, stock movement or controlled edit depends on it."))return;try{await reverseProductImport(id);await bootstrap();await loadBatches();dispatchEvent(new Event("dukora:attention"));notify("Bulk import safely reversed and audited")}catch(e){notify(e instanceof Error?e.message:"This batch cannot be reversed")}}
  return (
    <Page>
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
            <Field label="Barcode / SKU">
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </Field>
            <Field label="Unit or serving">
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{inventoryUnits.map(x=><option key={x}>{x}</option>)}</select>
            </Field>
            <Field label="Package size"><div className="button-row"><input type="number" min=".001" step=".001" value={form.packageQuantity} onChange={e=>setForm({...form,packageQuantity:+e.target.value})}/><select value={form.packageUnit} onChange={e=>setForm({...form,packageUnit:e.target.value})}>{measureUnits.map(x=><option key={x}>{x}</option>)}</select></div></Field>
            <Field label="Stock tracking"><select value={form.trackingMode} onChange={e=>setForm({...form,trackingMode:e.target.value})}><option>Discrete</option><option>Measured</option></select></Field>
            <Field label="Brand"><input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></Field>
            <Field label="Supplier"><input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}/></Field>
            <Field label="Tax rate %"><input type="number" min="0" max="100" step=".01" value={form.taxRate} onChange={e=>setForm({...form,taxRate:+e.target.value})}/></Field>
            <Field label="Cost price">
              <input
                type="number"
                value={form.costPrice}
                onChange={(e) =>
                  setForm({ ...form, costPrice: +e.target.value })
                }
              />
            </Field>
            <Field label="Selling price">
              <input
                type="number"
                value={form.sellingPrice}
                onChange={(e) =>
                  setForm({ ...form, sellingPrice: +e.target.value })
                }
              />
            </Field>
            <Field label="Opening stock">
              <input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: +e.target.value })}
              />
            </Field>
            <Field label="Minimum stock">
              <input
                type="number"
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
        <div className="export-card"><i>⇧</i><p>Download the controlled template, add up to 5,000 variants, then upload it for row-by-row validation. Separate sizes such as 500 ml and 1 L remain separate stock records.</p><button onClick={downloadProductTemplate}>⇩ Download item template</button><label className="outline-button">Choose completed CSV<input hidden type="file" accept=".csv,text/csv" onChange={e=>void chooseBulkFile(e.target.files?.[0])}/></label></div>
        {bulkRows.length>0&&<><div className="kpi-strip"><span><small>Rows</small><b>{bulkRows.length}</b></span><span><small>Valid</small><b>{bulkRows.length-bulkErrors.length}</b></span><span><small>Needs correction</small><b>{bulkErrors.length}</b></span></div><Filter><label>When an item/SKU already exists</label><select value={duplicatePolicy} onChange={e=>setDuplicatePolicy(e.target.value)}><option value="Skip">Skip existing</option><option value="Update">Update details only</option><option value="AddStock">Update details and add opening stock</option></select><button disabled={bulkErrors.length>0||importing} onClick={importBulk}>{importing?"Importing…":"Import validated rows"}</button></Filter>
        {bulkErrors.length>0&&<Panel title="Corrections required"><Table heads={["CSV row","Validation issue"]} rows={bulkErrors.map(x=>[String(x.row),x.errors.join("; ")])}/></Panel>}
        <Table heads={["Row","Item variant","SKU","Stock unit","Package size","Tracking","Opening stock","Cost","Price"]} rowClasses={bulkRows.slice(0,100).map(x=>bulkErrors.some(e=>e.row===x.rowNumber)?"debt":"")} rows={bulkRows.slice(0,100).map(x=>[x.rowNumber,`${x.name} · ${x.category}`,x.barcode||"—",x.stockUnit,`${x.packageQuantity} ${x.packageUnit}`,x.trackingMode,x.openingStock,money(x.costPrice),money(x.sellingPrice)])}/>{bulkRows.length>100&&<p className="muted">Preview shows the first 100 rows. All {bulkRows.length} rows will be validated and imported.</p>}{bulkResult&&<p className="insight-summary">Batch {bulkResult.batchId}: {bulkResult.created} created, {bulkResult.updated} updated, {bulkResult.stockAdded} stock additions and {bulkResult.skipped} skipped.</p>}</>}
      </Panel>
      <Panel title="Recent import batches"><Table heads={["Imported","Rows","Policy","Created","Updated","Skipped","Status","Action"]} rows={importBatches.map(x=>[new Date(x.createdAt).toLocaleString(),String(x.totalRows),x.duplicatePolicy,String(x.createdCount),String(x.updatedCount),String(x.skippedCount),x.status,x.status==="Completed"&&["Owner","Manager"].includes(user.role)?<button key={`reverse-${x.id}`} className="table-action" onClick={()=>void reverseBatch(x.id)}>Reverse safely</button>:"—"])}/></Panel>
      <Panel title="All items · edit or archive">
        <Table heads={["Item","Variant","Category","Stock","Cost","Price","POS","Status","Action"]} rows={products.map(x=>[x.name,`${x.packageQuantity||1} ${x.packageUnit||x.unit}`,x.category,`${x.stock} ${x.unit}`,money(x.costPrice),money(x.sellingPrice),x.sellable?"Yes":"No",x.active?"Active":"Archived",<button key={`product-${x.id}`} className="table-action" onClick={()=>setEditing({...x,packageQuantity:x.packageQuantity||1,packageUnit:x.packageUnit||x.unit,trackingMode:x.trackingMode||"Discrete",taxRate:x.taxRate||0,reason:""})}>Edit</button>])}/>
      </Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit item</h2><form className="item-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Category"><input required value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></Field><Field label="Brand"><input value={editing.brand||""} onChange={e=>setEditing({...editing,brand:e.target.value})}/></Field><Field label="Barcode / SKU"><input value={editing.barcode||""} onChange={e=>setEditing({...editing,barcode:e.target.value})}/></Field><Field label="Stock unit"><select value={editing.unit} onChange={e=>setEditing({...editing,unit:e.target.value})}>{inventoryUnits.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Package size"><div className="button-row"><input type="number" min=".001" step=".001" value={editing.packageQuantity} onChange={e=>setEditing({...editing,packageQuantity:+e.target.value})}/><select value={editing.packageUnit} onChange={e=>setEditing({...editing,packageUnit:e.target.value})}>{measureUnits.map(x=><option key={x}>{x}</option>)}</select></div></Field><Field label="Tracking"><select value={editing.trackingMode} onChange={e=>setEditing({...editing,trackingMode:e.target.value})}><option>Discrete</option><option>Measured</option></select></Field><Field label="Supplier"><input value={editing.supplier||""} onChange={e=>setEditing({...editing,supplier:e.target.value})}/></Field><Field label="Tax rate %"><input type="number" min="0" max="100" step=".01" value={editing.taxRate} onChange={e=>setEditing({...editing,taxRate:+e.target.value})}/></Field><Field label="Cost price"><input type="number" min="0" value={editing.costPrice} onChange={e=>setEditing({...editing,costPrice:+e.target.value})}/></Field><Field label="Selling price"><input type="number" min="0" value={editing.sellingPrice} onChange={e=>setEditing({...editing,sellingPrice:+e.target.value})}/></Field><Field label="Minimum stock"><input type="number" min="0" step={editing.trackingMode==="Measured"?".001":"1"} value={editing.minStock} onChange={e=>setEditing({...editing,minStock:+e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><div className="checks"><label><input type="checkbox" checked={editing.sellable} onChange={e=>setEditing({...editing,sellable:e.target.checked})}/> Sellable</label><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label></div><button>Save controlled change</button></form></section></div>}
    </Page>
  );
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
  const primaryUpdateManifest="https://dukora.beyondrawdata.com/releases/lite/latest.json";
  const fallbackUpdateManifest="https://dukora.beyondrawdata.co.ke/releases/lite/latest.json";
  const [theme, setTheme] = useState(localStorage.getItem("theme") ?? "Forest");
  const [settingsTab,setSettingsTab]=useState(sessionStorage.getItem("dukora_settings_tab")||"appearance");
  const [navigationLayout,setNavigationLayout]=useState(localStorage.getItem("navigation_layout")??"Vertical");
  const [displayScale, setDisplayScale] = useState<DisplayScaleName>(storedDisplayScale());
  const [organization,setOrganization]=useState<OrganizationSettings>(defaultOrganizationSettings);
  const selectedIndustry=profileFor(organization.industryProfile),selectedModules=enabledModules(organization.enabledModules);
  const releaseGroups=groupReleaseNotes(RELEASE_NOTES);
  const [receiptConfig,setReceiptConfig]=useState<ReceiptSettings>(defaultReceiptSettings);
  const [branches,setBranches]=useState<any[]>([]),[terminals,setTerminals]=useState<any[]>([]);
  const [branchForm,setBranchForm]=useState({name:"",code:"",address:"",phone:"",active:true});
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState(localStorage.getItem("receipt_printer") || "");
  const [silent, setSilent] = useState(localStorage.getItem("silent_print") === "true");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [deviceName, setDeviceName] = useState(localStorage.getItem("device_id") || `POS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`);
  const [terminalName,setTerminalName]=useState(localStorage.getItem("terminal_name")||"Front counter");
  const [branchId,setBranchId]=useState(localStorage.getItem("branch_id")||"");
  const [apiUrl, setApiUrl] = useState(localStorage.getItem("api_url") || "/api");
  const [updateUrl, setUpdateUrl] = useState(localStorage.getItem("update_manifest_url") || primaryUpdateManifest);
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; downloadUrl: string; sha256:string; summary?: string }>();
  const [updateBusy,setUpdateBusy]=useState(false);
  const [insightsConfig,setInsightsConfig]=useState({enabled:false,endpoint:"https://api.openai.com/v1/chat/completions",model:"gpt-5-mini",apiKey:"",apiKeyConfigured:false,clearApiKey:false,allowUserNames:false});
  const [backups,setBackups]=useState<any[]>([]),[purgeConfirmation,setPurgeConfirmation]=useState(""),[purgeReason,setPurgeReason]=useState(""),[maintenanceBusy,setMaintenanceBusy]=useState(false);
  useEffect(() => {
    getSettings().then((data)=>{setOrganization(data.organization);setReceiptConfig(data.receipt);setBranches(data.branches);setTerminals(data.terminals);localStorage.setItem("organization_profile",JSON.stringify(data.organization));localStorage.setItem("receipt_configuration",JSON.stringify(data.receipt));if(!branchId&&data.branches.length)setBranchId(data.branches[0].id)}).catch(()=>notify("Shared settings unavailable · using saved terminal configuration"));
    if(["Owner","Manager"].includes(user.role))getInsightsSettings().then(x=>setInsightsConfig(current=>({...current,...x,apiKey:"",clearApiKey:false}))).catch(()=>0);
    if(user.role==="Owner")getMaintenanceBackups().then(setBackups).catch(()=>0);
    listSilentPrinters()
      .then((items) => {
        setPrinters(items);
        setBridgeReady(true);
        if (!printer && items.length === 1) setPrinter(items[0]);
      })
      .catch(() => setBridgeReady(false));
  }, []);
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
  function saveTerminal() {
    localStorage.setItem("device_id", deviceName);
    localStorage.setItem("api_url", apiUrl);
    localStorage.setItem("update_manifest_url", updateUrl);
    notify("Terminal connection and update channel saved");
  }
  async function persistOrganization(){try{const saved=await saveOrganization(organization);setOrganization(saved);localStorage.setItem("organization_profile",JSON.stringify(saved));localStorage.setItem("business_name",saved.name);notify("Shared business profile saved")}catch(e){notify(e instanceof Error?e.message:"Business profile could not be saved")}}
  async function persistIndustry(){if(user.role!=="Owner"){notify("Only the Owner can change industry and enabled modules");return}try{const profile=profileFor(organization.industryProfile);const category=profile.categories.includes(organization.businessCategory||"")?organization.businessCategory!:profile.categories[0];const saved=await saveIndustryConfiguration({industryProfile:profile.key,businessCategory:category,enabledModules:Array.from(selectedModules)});setOrganization(saved);localStorage.setItem("organization_profile",JSON.stringify(saved));dispatchEvent(new CustomEvent("dukora:industry-profile",{detail:saved}));notify("Industry, terminology and enabled modules saved across the institution")}catch(e){notify(e instanceof Error?e.message:"Industry configuration could not be saved")}}
  async function persistReceipt(){try{const saved=await saveReceiptConfiguration(receiptConfig);setReceiptConfig(saved);localStorage.setItem("receipt_configuration",JSON.stringify(saved));localStorage.setItem("receipt_footer",saved.footer);notify("Shared receipt configuration saved")}catch(e){notify(e instanceof Error?e.message:"Receipt configuration could not be saved")}}
  async function persistInsights(){try{const saved=await saveInsightsSettings(insightsConfig);setInsightsConfig(current=>({...current,...saved,apiKey:"",clearApiKey:false}));notify(saved.enabled&&saved.apiKeyConfigured?"AI insights provider saved and encrypted":"Rule-based Smart Insights remains active")}catch(e){notify(e instanceof Error?e.message:"Owner authorization is required")}}
  async function persistBranch(){try{const saved=await saveBranch(branchForm);const data=await getSettings();setBranches(data.branches);setBranchForm({name:"",code:"",address:"",phone:"",active:true});if(!branchId)setBranchId(saved.id);notify("Branch saved")}catch(e){notify(e instanceof Error?e.message:"Branch could not be saved")}}
  async function persistTerminal(){if(!branchId){notify("Select or create a branch first");return}try{const existing=terminals.find(x=>x.deviceKey===deviceName);const saved=await saveTerminalConfiguration({id:existing?.id,branchId,name:terminalName,deviceKey:deviceName,active:true});localStorage.setItem("device_id",saved.deviceKey);localStorage.setItem("terminal_name",saved.name);localStorage.setItem("branch_id",saved.branchId);localStorage.setItem("branch_name",branches.find(x=>x.id===saved.branchId)?.name||"");setTerminals((await getSettings()).terminals);notify("This terminal is registered to the selected branch")}catch(e){notify(e instanceof Error?e.message:"Terminal registration could not be saved")}}
  async function checkUpdates(silent=false) {
    if (!updateUrl) { if(!silent)notify(`Version ${APP_VERSION} · add an HTTPS update manifest URL`); return; }
    setUpdateBusy(true);
    try {
      const candidates=updateUrl===primaryUpdateManifest?[primaryUpdateManifest,fallbackUpdateManifest]:[updateUrl];let manifest:any;
      for(const candidate of candidates){try{const parsed=new URL(candidate);if(parsed.protocol!=="https:")throw new Error("HTTPS is required");const response=await fetch(parsed,{cache:"no-store"});if(!response.ok)throw new Error(String(response.status));manifest=await response.json();break}catch{}}
      if(!manifest?.version||!manifest?.downloadUrl||!manifest?.sha256)throw new Error("Invalid release manifest");
      if (compareVersions(manifest.version,APP_VERSION)<=0) {
        setAvailableUpdate(undefined);
        if(!silent)notify(`TheBarcode ${APP_VERSION} is current`);
      } else {
        setAvailableUpdate(manifest);
        notify(`Update ${manifest.version} is available: ${manifest.summary || "New release"}`);
      }
    } catch { if(!silent)notify("Could not reach the update service"); }
    finally{setUpdateBusy(false)}
  }
  function installUpdate(){if(!availableUpdate)return;if(user.role!=="Owner"){notify("Only the Owner can install application updates");return}const desktop=(window as any).chrome?.webview;if(!desktop){window.open(availableUpdate.downloadUrl,"_blank","noopener");notify("Installer download opened; run it after the download completes");return}setUpdateBusy(true);desktop.postMessage({command:"installUpdate",version:availableUpdate.version,downloadUrl:availableUpdate.downloadUrl,sha256:availableUpdate.sha256})}
  useEffect(()=>{const desktop=(window as any).chrome?.webview;if(!desktop)return;const receive=(event:any)=>{const result=event.data;if(result?.type!=="dukoraUpdate")return;setUpdateBusy(false);notify(result.ok?result.message:`Update failed: ${result.message}`)};desktop.addEventListener("message",receive);return()=>desktop.removeEventListener("message",receive)},[]);
  useEffect(()=>{if(user.role!=="Owner")return;const timer=setTimeout(()=>void checkUpdates(true),5000);return()=>clearTimeout(timer)},[]);
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
  async function backupNow(){setMaintenanceBusy(true);try{const saved=await createMaintenanceBackup();setBackups(await getMaintenanceBackups());notify(`Backup saved locally: ${saved.fileName}`)}catch(e){notify(e instanceof Error?e.message:"Backup could not be created")}finally{setMaintenanceBusy(false)}}
  async function purgeNow(){if(purgeConfirmation!=="PURGE LIVE DATA")return;setMaintenanceBusy(true);try{const result=await purgeLiveData(purgeConfirmation,purgeReason);await purgeLocalLiveData();await bootstrap();setBackups(await getMaintenanceBackups());setPurgeConfirmation("");setPurgeReason("");notify(`Live records purged after backup ${result.backup.fileName}`);dispatchEvent(new CustomEvent("dukora:attention-refresh"))}catch(e){notify(e instanceof Error?e.message:"Live data could not be purged")}finally{setMaintenanceBusy(false)}}
  function restoreBackup(fileName:string){const desktop=(window as any).chrome?.webview;if(!desktop){notify("Restore is available from the installed TheBarcode desktop app");return}desktop.postMessage({command:"restoreBackup",fileName})}
  const settingsTabs=[{id:"appearance",label:"Appearance"},{id:"business",label:"Business"},{id:"hardware",label:"Devices & receipts"},...(["Owner","Manager"].includes(user.role)?[{id:"intelligence",label:"Smart Insights"}]:[]),...(user.role==="Owner"?[{id:"data",label:"Data protection"}]:[])];
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
      {activeSettingsTab==="business"&&<div className="settings-tab-panel" id="settings-panel-business" role="tabpanel"><Two>
        <Panel title="Business profile">
          <div className="settings-fields">
            <Field label="Trading name"><input value={organization.name} onChange={(e)=>setOrganization({...organization,name:e.target.value})}/></Field>
            <Field label="Legal name"><input value={organization.legalName||""} onChange={(e)=>setOrganization({...organization,legalName:e.target.value})}/></Field>
            <Field label="Industry"><select value={organization.industryProfile} onChange={(e)=>{const profile=profileFor(e.target.value);setOrganization({...organization,industryProfile:profile.key,businessCategory:profile.categories[0],enabledModules:profile.defaultModules.join(',')})}}>{industryProfiles.map(x=><option key={x.key} value={x.key}>{x.name}</option>)}</select></Field>
            <Field label="Business category"><select value={organization.businessCategory||selectedIndustry.categories[0]} onChange={e=>setOrganization({...organization,businessCategory:e.target.value})}>{selectedIndustry.categories.map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></Field>
            <div className="module-selector"><b>Enabled operational modules</b><small>Core sales, inventory and expenses remain enabled for data integrity.</small>{[{key:"sales",name:"Sales & POS",locked:true},{key:"inventory",name:"Inventory",locked:true},{key:"expenses",name:"Expenses",locked:true},{key:"production",name:selectedIndustry.productionLabel},{key:"reports",name:"Reports"},{key:"ai",name:"Smart Insights"},{key:"accounting",name:"Accounting"}].map(m=><label key={m.key}><input type="checkbox" disabled={m.locked} checked={selectedModules.has(m.key)} onChange={e=>{const next=new Set(selectedModules);e.target.checked?next.add(m.key):next.delete(m.key);setOrganization({...organization,enabledModules:Array.from(next).join(',')})}}/> {m.name}</label>)}</div>
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
            <div className="button-row"><button onClick={saveTerminal}>Save update channel</button><button disabled={updateBusy} onClick={()=>void checkUpdates(false)}>{updateBusy?"Checking…":"Check for updates"}</button></div>
            {availableUpdate?.downloadUrl && <button className="update-download" disabled={updateBusy} onClick={installUpdate}>{updateBusy?"Preparing update…":`Install TheBarcode ${availableUpdate.version}`}</button>}
            <small>Built and maintained by Beyond Raw Data</small>
          </div>
        </Panel>
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
                {printers.map((name) => <option key={name}>{name}</option>)}
              </select>
            </Field>
            <label className="print-toggle">
              <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} />
              Print silently through the local bridge
            </label>
            <button className="outline-button" onClick={() => {
              localStorage.setItem("receipt_printer", printer);
              localStorage.setItem("silent_print", String(silent));
              localStorage.setItem("receipt_cut", "false");
              notify("XP-80 printer configuration saved");
            }}>Save printer</button>
          </div>
          <button
            className="outline-button"
            onClick={async () => {
              localStorage.setItem("receipt_printer", printer);
              localStorage.setItem("silent_print", String(silent));
              const mode = await printReceiptText(testReceiptText());
              notify(mode === "silent" ? "Silent test receipt sent to XP-80" : "Print bridge unavailable · opened print preview");
            }}
          >
            Print test receipt
          </button>
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
          <p className="muted">Create local database backups, restore an earlier snapshot, or remove live business records before handover. Purge always creates and verifies a backup first. Staff accounts, business settings, terminals, receipt settings and the separate Demo environment are preserved.</p>
          <div className="button-row"><button disabled={maintenanceBusy} onClick={backupNow}>{maintenanceBusy?"Working…":"Back up now"}</button></div>
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
    </Page>
  );
}
function downloadPdfReport({from,to,summary,detail}:{from:string;to:string;summary:any;detail:any}){
  if(!summary||!detail)return;
  const org=cachedOrganizationSettings(),doc=new jsPDF({unit:"mm",format:"a4"}),green=[21,61,52] as [number,number,number],orange=[255,117,66] as [number,number,number];
  const revenue=Number(summary.revenue||0),cost=Number(summary.cost||0),expenses=Number(summary.expenses||0),gross=revenue-cost,net=gross-expenses,collectionRate=Number(summary.collectionRate||0),cashCollected=Number(summary.cashCollected||0),fmt=(n:number)=>`${org.currency} ${n.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  doc.setFillColor(...green);doc.rect(0,0,210,34,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(19);doc.text(org.name,14,14);doc.setFontSize(11);doc.text("Management summary",14,22);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text(`${from} to ${to} | Generated ${new Date().toLocaleString()}`,14,28);doc.setTextColor(24,38,33);
  const cards=[ ["Revenue",fmt(revenue)],["Gross profit",fmt(gross)],["Collected",`${collectionRate.toFixed(1)}%`],["Cash received",fmt(cashCollected)] ];cards.forEach((c,i)=>{const x=14+i*47;doc.setFillColor(244,248,246);doc.roundedRect(x,40,43,23,2,2,"F");doc.setFontSize(7);doc.setTextColor(100,115,108);doc.text(c[0],x+4,47);doc.setFontSize(11);doc.setFont("helvetica","bold");doc.setTextColor(24,55,46);doc.text(c[1],x+4,56,{maxWidth:36});doc.setFont("helvetica","normal")});
  doc.setFontSize(11);doc.setFont("helvetica","bold");doc.text("Daily revenue and gross profit",14,73);const daily=detail.daily||[],max=Math.max(1,...daily.map((x:any)=>Number(x.revenue)));daily.slice(-14).forEach((x:any,i:number)=>{const bx=15+i*12.8,rh=28*Number(x.revenue)/max,ph=28*Math.max(0,Number(x.profit))/max;doc.setFillColor(...green);doc.rect(bx,105-rh,5.2,rh,"F");doc.setFillColor(...orange);doc.rect(bx+5.2,105-ph,5.2,ph,"F");doc.setFontSize(5.5);doc.setTextColor(95);doc.text(new Date(x.date).toLocaleDateString(undefined,{month:"short",day:"numeric"}),bx,110,{angle:35})});doc.setFontSize(7);doc.setTextColor(...green);doc.text("Revenue",156,73);doc.setTextColor(...orange);doc.text("Gross profit",177,73);
  autoTable(doc,{startY:119,head:[["Profit, collection and loss","Amount"]],body:[["Posted sales revenue",fmt(revenue)],["Payments against period sales",fmt(Number(summary.salesCollected||0))],["Collection rate",`${collectionRate.toFixed(1)}%`],["Cash received during period",fmt(cashCollected)],["Cost of goods sold",fmt(cost)],["Gross profit",fmt(gross)],["Operating expenses",fmt(expenses)],["Net profit",fmt(net)]],theme:"grid",headStyles:{fillColor:green},styles:{fontSize:8}});
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+7,head:[["Top seller","Qty","Revenue","Profit"]],body:(detail.topSellers||[]).slice(0,8).map((x:any)=>[x.name,Number(x.quantity).toLocaleString(),fmt(Number(x.revenue)),fmt(Number(x.profit))]),theme:"striped",headStyles:{fillColor:green},styles:{fontSize:7.5}});
  doc.addPage();doc.setFillColor(...green);doc.rect(0,0,210,18,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(13);doc.text("Operations detail",14,12);doc.setTextColor(25);doc.setFont("helvetica","normal");
  autoTable(doc,{startY:25,head:[["Payment method","Collected"]],body:(detail.paymentMix||[]).map((x:any)=>[x.name,fmt(Number(x.amount))]),theme:"grid",headStyles:{fillColor:green},styles:{fontSize:8}});
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+7,head:[["Low stock item","Category","Stock","Minimum","Sell price"]],body:(detail.lowStock||[]).map((x:any)=>[x.name,x.category,String(x.stock),String(x.minStock),fmt(Number(x.sellingPrice))]),theme:"striped",headStyles:{fillColor:orange},styles:{fontSize:7.5}});
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+7,head:[["Expense","Category","Amount","Paid","Method"]],body:(detail.expenseRecords||[]).slice(0,30).map((x:any)=>[x.description,x.category,fmt(Number(x.amount)),fmt(Number(x.paidAmount)),x.method]),theme:"grid",headStyles:{fillColor:green},styles:{fontSize:7}});
  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(110);doc.text(`TheBarcode - ${org.name} - Page ${p} of ${pages}`,105,291,{align:"center"})}doc.save(`TheBarcode-report-${from}-to-${to}.pdf`);
}
function compareVersions(left:string,right:string){const a=left.replace(/^v/i,"").split(/[.-]/).map(x=>Number.parseInt(x,10)||0),b=right.replace(/^v/i,"").split(/[.-]/).map(x=>Number.parseInt(x,10)||0);for(let i=0;i<Math.max(a.length,b.length);i++){const difference=(a[i]||0)-(b[i]||0);if(difference)return difference}return 0}
const inventoryUnits=["item","piece","bottle","can","pack","tray","bag","portion","serving","shot","glass","ml","L","g","kg"];
const measureUnits=["item","piece","bottle","can","pack","tray","bag","portion","serving","shot","glass","ml","L","g","kg"];
const productTemplateHeaders=["name","category","brand","barcode_sku","stock_unit","package_quantity","package_unit","tracking_mode","cost_price","selling_price","opening_stock","minimum_stock","supplier","tax_rate","sellable"];
function csvCell(value:unknown){const text=String(value??"");return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}
function downloadProductTemplate(){const examples=[productTemplateHeaders,["Mineral Water","Soft drinks","Aqua","WATER-500","bottle",500,"ml","Discrete",35,80,24,8,"Demo Supplier",0,"TRUE"],["Mineral Water","Soft drinks","Aqua","WATER-1L","bottle",1,"L","Discrete",60,120,12,6,"Demo Supplier",0,"TRUE"],["Coffee beans","Coffee","","COFFEE-KG","kg",1,"kg","Measured",1200,1800,8.5,2,"Demo Supplier",16,"FALSE"],["Flour 5 kg","Kitchen consumable","","FLOUR-5KG","bag",5,"kg","Discrete",620,0,6,2,"Demo Supplier",0,"FALSE"]];const blob=new Blob(["\ufeff"+examples.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="TheBarcode-item-import-template.csv";a.click();URL.revokeObjectURL(a.href)}
function readCsv(text:string){const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===","&&!quoted){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=""}else cell+=c}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
function parseProductCsv(text:string){const matrix=readCsv(text.replace(/^\ufeff/,""));if(matrix.length<2)throw new Error("The template must contain a header and at least one item row");const headers=matrix[0].map(x=>x.trim().toLowerCase().replaceAll(" ","_"));const missing=productTemplateHeaders.filter(x=>!headers.includes(x));if(missing.length)throw new Error(`Missing columns: ${missing.join(", ")}`);const at=(row:string[],name:string)=>row[headers.indexOf(name)]?.trim()??"",num=(value:string)=>value===""?0:Number(value),bool=(value:string)=>["true","yes","1","y"].includes(value.toLowerCase());return matrix.slice(1).map((row,index)=>({rowNumber:index+2,name:at(row,"name"),category:at(row,"category"),brand:at(row,"brand")||null,barcode:at(row,"barcode_sku")||null,stockUnit:at(row,"stock_unit"),packageQuantity:num(at(row,"package_quantity")),packageUnit:at(row,"package_unit"),trackingMode:at(row,"tracking_mode"),costPrice:num(at(row,"cost_price")),sellingPrice:num(at(row,"selling_price")),openingStock:num(at(row,"opening_stock")),minimumStock:num(at(row,"minimum_stock")),supplier:at(row,"supplier")||null,taxRate:num(at(row,"tax_rate")),sellable:bool(at(row,"sellable"))}))}
function validateProductRows(rows:any[]){const allowed=new Set(inventoryUnits.map(x=>x.toLowerCase())),seen=new Set<string>(),variants=new Set<string>();return rows.flatMap(row=>{const errors:string[]=[];if(!row.name)errors.push("Item name is required");if(!row.category)errors.push("Category is required");if(!allowed.has(String(row.stockUnit).toLowerCase()))errors.push("Unsupported stock unit");if(!allowed.has(String(row.packageUnit).toLowerCase()))errors.push("Unsupported package unit");for(const key of ["packageQuantity","costPrice","sellingPrice","openingStock","minimumStock","taxRate"])if(!Number.isFinite(row[key]))errors.push(`${key} must be numeric`);if(row.packageQuantity<=0)errors.push("Package quantity must be greater than zero");if(row.costPrice<0||row.sellingPrice<0||row.openingStock<0||row.minimumStock<0)errors.push("Prices and stock cannot be negative");if(row.taxRate<0||row.taxRate>100)errors.push("Tax rate must be between 0 and 100");if(!["discrete","measured"].includes(String(row.trackingMode).toLowerCase()))errors.push("Tracking mode must be Discrete or Measured");if(String(row.trackingMode).toLowerCase()==="discrete"&&(!Number.isInteger(row.openingStock)||!Number.isInteger(row.minimumStock)))errors.push("Discrete stock requires whole quantities");if([row.packageQuantity,row.openingStock,row.minimumStock].some((x:number)=>{const decimal=String(x).split(".")[1];return decimal&&decimal.length>3}))errors.push("Quantities support at most 3 decimals");if(row.barcode){const key=String(row.barcode).toLowerCase();if(seen.has(key))errors.push("Duplicate barcode/SKU in file");seen.add(key)}const variant=`${row.name}|${row.category}|${row.packageQuantity}|${row.packageUnit}`.toLowerCase();if(variants.has(variant))errors.push("Duplicate item/package-size variant in file");variants.add(variant);return errors.length?[{row:row.rowNumber,errors}]:[]})}
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
        <article key={x[0]} className="interactive-kpi" onClick={()=>activate(x)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate(x)}}} role="button" tabIndex={0}>
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
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="spec-field">
      <span>{label}</span>
      {children}
    </label>
  );
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
function Table({ heads, rows, rowClasses=[] }: { heads: string[]; rows: ReactNode[][];rowClasses?:string[] }) {
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<{index:number;direction:"asc"|"desc"}|null>(null);
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
  ];
  const records=rows.map((cells,index)=>({cells,index,className:rowClasses[index]||""}));
  const normalized=query.trim().toLocaleLowerCase();
  const visible=records.filter(row=>!normalized||row.cells.some(cell=>gridText(cell).toLocaleLowerCase().includes(normalized))).sort((left,right)=>{
    if(!sort)return left.index-right.index;
    const a=gridSortValue(left.cells[sort.index]),b=gridSortValue(right.cells[sort.index]);
    const compared=typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"});
    return compared*(sort.direction==="asc"?1:-1)||left.index-right.index;
  });
  const changeSort=(index:number)=>setSort(current=>current?.index===index?{index,direction:current.direction==="asc"?"desc":"asc"}:{index,direction:"asc"});
  return (
    <div className="data-grid">
      <div className="grid-toolbar">
        <label><span className="sr-only">Search this grid</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search this grid…" aria-label="Search this grid"/></label>
        <small>{visible.length} of {rows.length} {rows.length===1?"row":"rows"}</small>
        {(query||sort)&&<button type="button" onClick={()=>{setQuery("");setSort(null)}}>Reset view</button>}
      </div>
      <div className="spec-table-wrap">
      <table className="spec-table">
        <thead>
          <tr>
            {heads.map((x,index) => {const sortable=!/^(action|decision)$/i.test(x);return <th key={x} aria-sort={sort?.index===index?(sort.direction==="asc"?"ascending":"descending"):undefined}>{sortable?<button type="button" className="grid-sort" onClick={()=>changeSort(index)}>{x}<span aria-hidden="true">{sort?.index===index?(sort.direction==="asc"?"↑":"↓"):"↕"}</span></button>:x}</th>})}
          </tr>
        </thead>
        <tbody>
          {visible.map(({cells:r,index,className}) => (
            <tr
              className={`${className} ${r.some(x=>x==="Debt") ? "row-debt" : ""} ${r.some(x=>x==="Watch") ? "row-watch" : ""}`}
              key={index}
            >
              {r.map((x, j) => (
                <td key={j}>
                  {j === r.length - 1 && typeof x==="string" && statuses.includes(x) ? (
                    <span className={`badge ${x.toLowerCase()}`}>{x}</span>
                  ) : (
                    x
                  )}
                </td>
              ))}
            </tr>
          ))}
          {!visible.length&&<tr><td className="grid-empty" colSpan={heads.length}>No rows match “{query}”.</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}
