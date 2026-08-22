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
  createProduct,
  createStaff,
  getAudit,
  getCustomerSummary,
  getExpenses,
  getInsights,
  getInsightsSettings,
  getOperationalOverview,
  getSummary,
  getStaff,
  getSettings,
  getBills,
  payBill,
  postBill,
  cancelBill,
  refundBill,
  updateBill,
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
} from "./api";
import {
  db,
  queueCustomer,
  queueStockMovement,
  removeLocalDemo,
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
  if (view === "Bills") return <Bills user={user} notify={notify} />;
  if (view === "Inventory")
    return <Inventory products={products} user={user} notify={notify} />;
  if (view === "Customers") return <Customers />;
  if (view === "Expenses") return <Expenses />;
  if (view === "Reports") return <Reports />;
  if (view === "Smart insights") return <SmartInsights />;
  if (view === "Audit" || view === "Audit trail") return <Audit user={user} />;
  if (["Staff", "Users & roles", "Staff & roles"].includes(view))
    return <Staff notify={notify} />;
  if (view === "Item setup") return <ItemSetup products={products} notify={notify} />;
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
            center="78%"
            subtitle="collected"
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
function Bills({user,notify}:{user:{id:string;name:string;role:string};notify:(x:string)=>void}){
  const [status,setStatus]=useState(localStorage.getItem("bill_filter")||"Pending"),[rows,setRows]=useState<any[]>([]),[selected,setSelected]=useState<any>(),[lines,setLines]=useState<any[]>([]),[payment,setPayment]=useState({method:"Cash",amount:0,reference:""});
  const load=()=>getBills(status).then(setRows).catch(()=>setRows([]));useEffect(()=>{localStorage.removeItem("bill_filter");void load()},[status]);
  const open=(x:any)=>{setSelected(x);setLines(x.items.map((i:any)=>({productId:i.productId,productName:i.productName,quantity:Number(i.quantity),unitPrice:Number(i.unitPrice),discount:Number(i.discount||0)})));setPayment({method:"Cash",amount:Number(x.balance||0),reference:""})};
  const saveHeld=async()=>{try{const saved=await updateBill(selected.id,{customerId:selected.customerId,discount:selected.discount||0,notes:selected.notes,reason:"Bill revision approved in bill workspace",deviceId:localStorage.getItem("device_id"),expectedRevision:selected.revision,items:lines.map(x=>({productId:x.productId,quantity:x.quantity,unitPrice:x.unitPrice,discount:x.discount}))});setSelected(saved);notify(`Bill #${saved.receiptNumber} revision ${saved.revision} saved`);await load()}catch(e){notify(e instanceof Error?e.message:"Owner or manager approval is required")}};
  const post=async(kind:"Paid"|"Credit")=>{try{const saved=await postBill(selected.id,{status:kind,method:"Cash",amountPaid:kind==="Paid"?selected.total:0,dueAt:kind==="Credit"?new Date(Date.now()+7*86400000).toISOString():undefined,notes:"Posted from bill workspace",deviceId:localStorage.getItem("device_id")});setSelected(saved);notify(`${kind} bill posted; stock and reports updated`);await load()}catch(e){notify(e instanceof Error?e.message:"Bill could not be posted")}};
  const recordPayment=async()=>{try{const saved=await payBill(selected.id,{...payment,deviceId:localStorage.getItem("device_id")});setSelected(saved);notify(`Payment recorded; balance ${money(saved.balance)}`);await load()}catch(e){notify(e instanceof Error?e.message:"Payment could not be recorded")}};
  const cancel=async()=>{const reason=prompt("Owner/manager cancellation reason");if(!reason)return;try{await cancelBill(selected.id,reason,localStorage.getItem("device_id")||undefined);setSelected(undefined);notify("Held bill cancelled with audit record");await load()}catch{notify("Owner or manager authorization is required")}};
  const refund=async()=>{const reason=prompt("Owner/manager refund reason");if(!reason)return;try{await refundBill(selected.id,reason,localStorage.getItem("device_id")||undefined);setSelected(undefined);notify("Sale refunded; inventory and accounts reversed");await load()}catch{notify("Owner or manager authorization is required")}};
  const print=async()=>{const credit=selected.status!=="Paid";const text=buildSaleReceipt({id:String(selected.receiptNumber),customerName:selected.customerName||"Walk-in customer",cashierName:selected.cashierName||user.name,method:selected.payments?.at(-1)?.method||"Unpaid",credit,items:lines.map(x=>({name:x.productName,quantity:x.quantity,unitPrice:x.unitPrice})),total:selected.total});await printReceiptText(selected.status==="Held"?text.replace("CREDIT SALE","UNPAID BILL").replace("STATUS: UNPAID / CREDIT",`STATUS: HELD / UNPAID\nREVISION: ${selected.revision}\nNOT A PAYMENT RECEIPT`):text)};
  const totals={held:rows.filter(x=>x.status==="Held").length,credit:rows.filter(x=>x.status==="Credit"||x.status==="PartiallyPaid").reduce((s,x)=>s+Number(x.balance),0),overdue:rows.filter(x=>x.dueAt&&new Date(x.dueAt)<new Date()&&x.balance>0).length};
  return <Page><Intro title="Bills & payment follow-up" text="Open, revise, post and collect against the complete live bill register."/>
    <Filter>{["All","Pending","Held","Credit","PartiallyPaid","Paid","Cancelled"].map(x=><button className={status===x?"active":""} onClick={()=>setStatus(x)} key={x}>{x}</button>)}</Filter>
    <Kpis items={[["Held bills",String(totals.held),"Editable unpaid orders"],["Outstanding",money(totals.credit),"Credit and partial balances"],["Overdue",String(totals.overdue),"Past due date"],["Visible bills",String(rows.length),`Filter: ${status}`]]}/>
    <Panel title="Bill register"><div className="spec-table-wrap"><table className="spec-table"><thead><tr>{["Bill","Date","Customer","Status","Total","Paid","Balance","Action"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>#{x.receiptNumber} · r{x.revision}</td><td>{new Date(x.occurredAt).toLocaleString()}</td><td>{x.customerName||"Walk-in"}</td><td><span className={`badge ${String(x.status).toLowerCase()}`}>{x.status}</span></td><td>{money(x.total)}</td><td>{money(x.paid)}</td><td>{money(x.balance)}</td><td><button className="table-action" onClick={()=>open(x)}>Open</button></td></tr>)}</tbody></table></div></Panel>
    {selected&&<div className="modal bill-workspace"><section><button className="close" onClick={()=>setSelected(undefined)}>×</button><h2>Bill #{selected.receiptNumber}</h2><p className="muted">{selected.status} · Revision {selected.revision} · {selected.customerName||"Walk-in customer"}</p>
      <div className="bill-edit-lines">{lines.map((x,i)=><div key={x.productId}><b>{x.productName}</b><Field label="Quantity"><input type="number" min=".01" step=".01" disabled={selected.status!=="Held"} value={x.quantity} onChange={e=>setLines(lines.map((v,j)=>j===i?{...v,quantity:+e.target.value}:v))}/></Field><Field label="Price"><input type="number" min="0" disabled={selected.status!=="Held"} value={x.unitPrice} onChange={e=>setLines(lines.map((v,j)=>j===i?{...v,unitPrice:+e.target.value}:v))}/></Field><strong>{money(x.quantity*x.unitPrice)}</strong></div>)}</div>
      <div className="button-row">{selected.status==="Held"&&<><button onClick={saveHeld}>Save revision</button><button onClick={()=>post("Paid")}>Post paid</button><button onClick={()=>post("Credit")} disabled={!selected.customerId}>Post credit</button><button className="danger-button" onClick={cancel}>Cancel</button></>}{["Paid","Credit","PartiallyPaid"].includes(selected.status)&&["Owner","Manager"].includes(user.role)&&<button className="danger-button" onClick={refund}>Refund / reverse</button>}<button onClick={print}>Print current document</button></div>
      {(selected.status==="Credit"||selected.status==="PartiallyPaid")&&<div className="payment-box"><h3>Record later payment</h3><Field label="Method"><select value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Bank</option></select></Field><Field label="Amount"><input type="number" min=".01" max={selected.balance} value={payment.amount} onChange={e=>setPayment({...payment,amount:+e.target.value})}/></Field><Field label="Reference"><input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></Field><button onClick={recordPayment}>Record payment</button></div>}
      <Panel title="Immutable revision history"><Table heads={["Revision","Action","Reason","Time"]} rows={(selected.revisions||[]).map((x:any)=>[String(x.revision),x.action,x.reason,new Date(x.createdAt).toLocaleString()])}/></Panel>
    </section></div>}
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
  const [open, setOpen] = useState(false),
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
    syncOutbox().catch(() => 0);
    setOpen(false);
    notify("Stock movement saved safely and queued for sync");
  }
  return (
    <Page>
      <Intro
        title="Stock overview"
        text="Bar, café, kitchen and food stock with pending updates included."
        action="＋ Stock movement"
        onAction={() => setOpen(true)}
      />
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
      <Kpis
        items={[
          [
            "Stock value",
            money(products.reduce((s, x) => s + x.stock * x.costPrice, 0)),
            "At cost",
          ],
          [
            "Low stock",
            `${products.filter((x) => x.stock <= x.minStock).length} items`,
            "Reorder today",
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
              ["Low", products.filter((x) => x.stock <= x.minStock).length],
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
            x.stock <= x.minStock ? "Low" : "Healthy",
          ])}
        />
      </Panel>
    </Page>
  );
}
function Customers() {
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
  }
  async function saveEdit(e:FormEvent){e.preventDefault();try{await updateCustomer(editing.id,{name:editing.name,phone:editing.phone,creditLimit:editing.creditLimit,notes:editing.notes,active:editing.active!==false,reason:editing.reason});setEditing(undefined);setRemote(await getCustomerSummary())}catch{alert("A reason and authorized session are required")}}
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
      <Panel title="Customer directory"><div className="spec-table-wrap"><table className="spec-table"><thead><tr>{["Customer","Phone","Money spent","Debt","Last visit","Risk","Action"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{ranked.map(x=><tr className={x.debt>0?"row-debt":""} key={x.id||x.name}><td>{x.name}</td><td>{x.phone||"—"}</td><td>{money(x.totalSpent)}</td><td>{money(x.debt)}</td><td>{x.lastVisit?new Date(x.lastVisit).toLocaleDateString():"—"}</td><td><span className={`badge ${x.debt>0?"debt":"clear"}`}>{x.debt>0?"Debt":"Clear"}</span></td><td><button className="table-action" onClick={()=>setEditing({...x,active:x.active!==false,reason:""})}>Edit</button></td></tr>)}</tbody></table></div></Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit customer</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Phone"><input value={editing.phone||""} onChange={e=>setEditing({...editing,phone:e.target.value})}/></Field><Field label="Credit limit"><input type="number" min="0" value={editing.creditLimit} onChange={e=>setEditing({...editing,creditLimit:+e.target.value})}/></Field><Field label="Notes"><input value={editing.notes||""} onChange={e=>setEditing({...editing,notes:e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label><button>Save controlled change</button></form></section></div>}
    </Page>
  );
}
function Expenses() {
  const today=new Date().toISOString().slice(0,10), month=new Date();month.setDate(1);
  const [category, setCategory] = useState("All"),[from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[rows,setRows]=useState<any[]>([]);
  const load=()=>getExpenses(from,to,category).then(setRows).catch(()=>setRows([]));
  useEffect(()=>{void load()},[category]);
  const categories=Array.from(new Set(rows.map(x=>x.category))), grouped=Array.from(rows.reduce<Map<string,number>>((m,x)=>m.set(x.category,(m.get(x.category)||0)+Number(x.amount)),new Map<string,number>())).map(([name,v])=>({name,v}));
  return (
    <Page>
      <Intro
        title="Expenses & suppliers"
        text="Explore costs by period, category and payment status."
        action="Live PostgreSQL records"
      />
      <Filter>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {["All", ...categories].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
        <span>to</span>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
        <button onClick={load}>Apply filters</button>
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
          heads={["Description", "Category", "Amount", "Status"]}
          rows={rows.map((x) => [
            x.description,
            x.category,
            money(x.amount),
            Number(x.paidAmount)>=Number(x.amount)?"Paid":"Pending",
          ])}
        />
      </Panel>
    </Page>
  );
}
function Reports() {
  const today=new Date().toISOString().slice(0,10), month=new Date();month.setDate(1);
  const [range, setRange] = useState("This month"),[from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[summary,setSummary]=useState<any>(null),[detail,setDetail]=useState<any>(null);
  const load=()=>Promise.all([getSummary(from,to),getOperationalOverview(from,to)]).then(([s,d])=>{setSummary(s);setDetail(d)}).catch(()=>{setSummary(null);setDetail(null)});useEffect(()=>{void load()},[]);
  const gross=(summary?.revenue??0)-(summary?.cost??0),net=gross-(summary?.expenses??0);
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
        <button className="apply" onClick={load}>Refresh report</button>
      </div>
      <Kpis
        items={[
          ["Revenue", money(summary?.revenue??0), `${summary?.salesCount??0} sales`],
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
            <button onClick={()=>downloadPdfReport({from,to,summary,detail})}>
              ⇩ Download PDF report
            </button>
          </div>
        </Panel>
      </Two>
    </Page>
  );
}

function SmartInsights(){
  const today=new Date().toISOString().slice(0,10), start=new Date();start.setDate(start.getDate()-29);
  const [from,setFrom]=useState(start.toISOString().slice(0,10)),[to,setTo]=useState(today),[data,setData]=useState<any>(null),[loading,setLoading]=useState(false);
  const load=()=>{setLoading(true);getInsights(from,to).then(setData).catch(()=>setData(null)).finally(()=>setLoading(false))};useEffect(load,[]);
  return <Page>
    <Intro title="Smart insights" text="Live business signals from sales, stock, customer credit and expenses." action={data?.mode==="ai"?"✦ AI analysis active":"◆ Rule engine active"}/>
    <Filter><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><span>to</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/><button onClick={load}>{loading?"Analysing…":"Refresh insights"}</button></Filter>
    <Panel title="Business briefing"><p className="insight-summary">{data?.summary??(loading?"Analysing live records…":"Insights are unavailable. Confirm this terminal is connected to the local server.")}</p><small>{data?.providerStatus} · No customer names, phone numbers or receipt-level data are sent to an AI provider.</small></Panel>
    <div className="insight-grid">{(data?.insights??[]).map((x:any)=><article className={`insight-card ${x.severity}`} key={x.id}><header><span>{x.category}</span><b>{x.metric}</b></header><h3>{x.title}</h3><p>{x.description}</p><footer><strong>Suggested action</strong>{x.recommendation}</footer></article>)}</div>
    <Panel title="How analysis works"><p>Without an enabled AI provider, Dukora always uses its built-in deterministic rules. Owners can configure an HTTPS chat-model endpoint, model and API key in Settings. The key is encrypted by the local server and is never returned to the browser.</p></Panel>
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
    } catch {
      notify("Owner authorization is required");
    }
  }
  async function saveEdit(e:FormEvent){e.preventDefault();try{await updateStaff(editing.id,{name:editing.name,role:editing.role,active:editing.active,newPin:editing.newPin||null,reason:editing.reason});setEditing(undefined);await load();notify("Staff access updated and audited")}catch{notify("Owner authorization, reason and valid PIN are required")}}
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
      <Panel title="Team & access"><div className="spec-table-wrap"><table className="spec-table"><thead><tr>{["Name","Role","Discount","Stock","Reports","Status","Action"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.role}</td><td>{x.role==="Owner"||x.role==="Manager"?"Yes":"No"}</td><td>{x.role==="Owner"||x.role==="Storekeeper"?"Yes":"No"}</td><td>{x.role==="Owner"||x.role==="Manager"?"Yes":"No"}</td><td>{x.active?"Active":"Inactive"}</td><td><button className="table-action" onClick={()=>setEditing({...x,newPin:"",reason:""})}>Edit</button></td></tr>)}</tbody></table></div></Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit staff access</h2><form className="customer-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Role"><select value={editing.role} onChange={e=>setEditing({...editing,role:e.target.value})}>{["Cashier","Storekeeper","Manager","Auditor","Owner"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="New PIN (optional)"><input type="password" minLength={6} value={editing.newPin} onChange={e=>setEditing({...editing,newPin:e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to deactivate)</label><button>Save access change</button></form></section></div>}
    </Page>
  );
}
function ItemSetup({ products,notify }: {products:Product[]; notify: (x: string) => void }) {
  const [editing,setEditing]=useState<any>();
  const [form, setForm] = useState({
    name: "",
    category: "Beer",
    barcode: "",
    unit: "",
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
      notify("Item saved");
    } catch {
      notify("Manager connection required");
    }
  }
  async function saveEdit(e:FormEvent){e.preventDefault();try{const saved=await updateProduct(editing.id,{...editing,reason:"Item details updated from setup"});await db.products.put(saved);setEditing(undefined);notify("Item updated with audit history")}catch(e){notify(e instanceof Error?e.message:"Inventory permission required")}}
  return (
    <Page>
      <Intro
        title="Item setup"
        text="Add anything sold or consumed across the bar, café and kitchen."
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
                {[
                  "Beer",
                  "Spirits",
                  "Coffee",
                  "Soft drinks",
                  "Food",
                  "Bakery",
                  "Kitchen consumable",
                  "Operations",
                ].map((x) => (
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
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </Field>
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
        <Panel title="Category guide">
          <div className="category-guide">
            {[
              ["B", "Beer & cider", "Bottles, cans, draught"],
              ["S", "Spirits & wine", "Bottles, shots, glasses"],
              ["C", "Coffee & tea", "Beans, servings, add-ons"],
              ["F", "Food & bakery", "Meals, snacks, pastries"],
              ["K", "Kitchen", "Milk, oil, ingredients"],
              ["O", "Operations", "Tissue, gas, cleaning"],
            ].map((x) => (
              <p key={x[0]}>
                <i>{x[0]}</i>
                <span>
                  <b>{x[1]}</b>
                  <small>{x[2]}</small>
                </span>
              </p>
            ))}
          </div>
        </Panel>
      </Two>
      <Panel title="All items · edit or archive">
        <div className="spec-table-wrap"><table className="spec-table"><thead><tr>{["Item","Category","Stock","Cost","Price","POS","Status","Action"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{products.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.category}</td><td>{x.stock}</td><td>{money(x.costPrice)}</td><td>{money(x.sellingPrice)}</td><td>{x.sellable?"Yes":"No"}</td><td>{x.active?"Active":"Archived"}</td><td><button className="table-action" onClick={()=>setEditing({...x,reason:""})}>Edit</button></td></tr>)}</tbody></table></div>
      </Panel>
      {editing&&<div className="modal record-editor"><section><button className="close" onClick={()=>setEditing(undefined)}>×</button><h2>Edit item</h2><form className="item-form" onSubmit={saveEdit}><Field label="Name"><input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></Field><Field label="Category"><input required value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></Field><Field label="Barcode / SKU"><input value={editing.barcode||""} onChange={e=>setEditing({...editing,barcode:e.target.value})}/></Field><Field label="Unit"><input required value={editing.unit} onChange={e=>setEditing({...editing,unit:e.target.value})}/></Field><Field label="Cost price"><input type="number" min="0" value={editing.costPrice} onChange={e=>setEditing({...editing,costPrice:+e.target.value})}/></Field><Field label="Selling price"><input type="number" min="0" value={editing.sellingPrice} onChange={e=>setEditing({...editing,sellingPrice:+e.target.value})}/></Field><Field label="Minimum stock"><input type="number" min="0" value={editing.minStock} onChange={e=>setEditing({...editing,minStock:+e.target.value})}/></Field><Field label="Reason"><input required value={editing.reason} onChange={e=>setEditing({...editing,reason:e.target.value})}/></Field><div className="checks"><label><input type="checkbox" checked={editing.sellable} onChange={e=>setEditing({...editing,sellable:e.target.checked})}/> Sellable</label><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Active (clear to archive)</label></div><button>Save controlled change</button></form></section></div>}
    </Page>
  );
}
function Settings({
  user,
  notify,
}: {
  user: Props["user"];
  notify: (x: string) => void;
}) {
  const [theme, setTheme] = useState(localStorage.getItem("theme") ?? "Forest");
  const [displayScale, setDisplayScale] = useState<DisplayScaleName>(storedDisplayScale());
  const [organization,setOrganization]=useState<OrganizationSettings>(defaultOrganizationSettings);
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
  const [updateUrl, setUpdateUrl] = useState(localStorage.getItem("update_manifest_url") || "");
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; downloadUrl: string; summary?: string }>();
  const [insightsConfig,setInsightsConfig]=useState({enabled:false,endpoint:"https://api.openai.com/v1/chat/completions",model:"gpt-5-mini",apiKey:"",apiKeyConfigured:false,clearApiKey:false,allowUserNames:false});
  useEffect(() => {
    getSettings().then((data)=>{setOrganization(data.organization);setReceiptConfig(data.receipt);setBranches(data.branches);setTerminals(data.terminals);localStorage.setItem("organization_profile",JSON.stringify(data.organization));localStorage.setItem("receipt_configuration",JSON.stringify(data.receipt));if(!branchId&&data.branches.length)setBranchId(data.branches[0].id)}).catch(()=>notify("Shared settings unavailable · using saved terminal configuration"));
    if(["Owner","Manager"].includes(user.role))getInsightsSettings().then(x=>setInsightsConfig(current=>({...current,...x,apiKey:"",clearApiKey:false}))).catch(()=>0);
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
  function saveTerminal() {
    localStorage.setItem("device_id", deviceName);
    localStorage.setItem("api_url", apiUrl);
    localStorage.setItem("update_manifest_url", updateUrl);
    notify("Terminal connection and update channel saved");
  }
  async function persistOrganization(){const saved=await saveOrganization(organization);setOrganization(saved);localStorage.setItem("organization_profile",JSON.stringify(saved));localStorage.setItem("business_name",saved.name);notify("Shared business profile saved");}
  async function persistReceipt(){const saved=await saveReceiptConfiguration(receiptConfig);setReceiptConfig(saved);localStorage.setItem("receipt_configuration",JSON.stringify(saved));localStorage.setItem("receipt_footer",saved.footer);notify("Shared receipt configuration saved");}
  async function persistInsights(){try{const saved=await saveInsightsSettings(insightsConfig);setInsightsConfig(current=>({...current,...saved,apiKey:"",clearApiKey:false}));notify(saved.enabled&&saved.apiKeyConfigured?"AI insights provider saved and encrypted":"Rule-based Smart Insights remains active")}catch(e){notify(e instanceof Error?e.message:"Owner authorization is required")}}
  async function persistBranch(){const saved=await saveBranch(branchForm);const data=await getSettings();setBranches(data.branches);setBranchForm({name:"",code:"",address:"",phone:"",active:true});if(!branchId)setBranchId(saved.id);notify("Branch saved");}
  async function persistTerminal(){if(!branchId){notify("Select or create a branch first");return}const existing=terminals.find(x=>x.deviceKey===deviceName);const saved=await saveTerminalConfiguration({id:existing?.id,branchId,name:terminalName,deviceKey:deviceName,active:true});localStorage.setItem("device_id",saved.deviceKey);localStorage.setItem("terminal_name",saved.name);localStorage.setItem("branch_id",saved.branchId);localStorage.setItem("branch_name",branches.find(x=>x.id===saved.branchId)?.name||"");setTerminals((await getSettings()).terminals);notify("This terminal is registered to the selected branch");}
  async function checkUpdates() {
    if (!updateUrl) { notify(`Version ${APP_VERSION} · add an update manifest URL when hosting is ready`); return; }
    try {
      const manifest = await fetch(updateUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
      if (manifest.version === APP_VERSION) {
        setAvailableUpdate(undefined);
        notify(`Dukora ${APP_VERSION} is current`);
      } else {
        setAvailableUpdate(manifest);
        notify(`Update ${manifest.version} is available: ${manifest.summary || "New release"}`);
      }
    } catch { notify("Could not reach the update service"); }
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
  return (
    <Page>
      <Intro
        title="Device & business settings"
        text="Configure this terminal, printer, themes and offline behaviour."
      />
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
      <Panel title="Display size">
        <p className="display-scale-help">Scale the complete interface proportionally for comfortable POS viewing. Cards, charts, navigation and touch targets reflow together to preserve Dukora’s layout.</p>
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
      <Two>
        <Panel title="Business profile">
          <div className="settings-fields">
            <Field label="Trading name"><input value={organization.name} onChange={(e)=>setOrganization({...organization,name:e.target.value})}/></Field>
            <Field label="Legal name"><input value={organization.legalName||""} onChange={(e)=>setOrganization({...organization,legalName:e.target.value})}/></Field>
            <Field label="Industry profile"><select value={organization.industryProfile} onChange={(e)=>setOrganization({...organization,industryProfile:e.target.value})}><option value="BarCafe">Bar & café</option><option value="Restaurant">Restaurant</option><option value="Bakery">Bakery & cakes</option><option value="Retail">General retail</option><option value="Services">Services</option><option value="Hotel">Hotel</option><option value="Custom">Custom</option></select></Field>
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
        <Panel title={`Dukora ${APP_VERSION}`}>
          <div className="release-card">
            <p><b>Channel:</b> {APP_CHANNEL}</p>
            <ul>{RELEASE_NOTES.map((note) => <li key={note}>{note}</li>)}</ul>
            <Field label="Update manifest URL"><input value={updateUrl} onChange={(e) => setUpdateUrl(e.target.value)} placeholder="https://…/latest.json" /></Field>
            <div className="button-row"><button onClick={saveTerminal}>Save update channel</button><button onClick={checkUpdates}>Check for updates</button></div>
            {availableUpdate?.downloadUrl && <a className="update-download" href={availableUpdate.downloadUrl}>Download Dukora {availableUpdate.version}</a>}
            <small>Built and maintained by Beyond Raw Data</small>
          </div>
        </Panel>
      </Two>
      <Two>
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
      {["Owner","Manager"].includes(user.role)&&<Panel title="Smart Insights provider">
        <p className="muted">Optional server-side chat model configuration. The key is encrypted before storage and is never returned to the browser. If this is disabled or unavailable, Dukora automatically uses its deterministic business rule engine.</p>
        <div className="receipt-config-grid"><Field label="HTTPS chat-completions endpoint"><input value={insightsConfig.endpoint} onChange={e=>setInsightsConfig({...insightsConfig,endpoint:e.target.value})}/></Field><Field label="Model"><input value={insightsConfig.model} onChange={e=>setInsightsConfig({...insightsConfig,model:e.target.value})}/></Field><Field label={insightsConfig.apiKeyConfigured?"Replace API key (configured)":"API key"}><input type="password" autoComplete="new-password" value={insightsConfig.apiKey} onChange={e=>setInsightsConfig({...insightsConfig,apiKey:e.target.value})}/></Field></div>
        <div className="receipt-toggles"><label><input type="checkbox" checked={insightsConfig.enabled} onChange={e=>setInsightsConfig({...insightsConfig,enabled:e.target.checked})}/> Enable configured AI provider</label><label><input type="checkbox" checked={insightsConfig.allowUserNames} onChange={e=>setInsightsConfig({...insightsConfig,allowUserNames:e.target.checked})}/> Allow staff names in operational activity summaries</label><label><input type="checkbox" checked={insightsConfig.clearApiKey} onChange={e=>setInsightsConfig({...insightsConfig,clearApiKey:e.target.checked})}/> Remove saved API key</label></div><button className="outline-button" onClick={persistInsights}>Save Smart Insights configuration</button>
      </Panel>}
      {user.role === "Owner" && (
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
      )}
    </Page>
  );
}
function downloadPdfReport({from,to,summary,detail}:{from:string;to:string;summary:any;detail:any}){
  if(!summary||!detail){alert("Refresh the report before downloading");return}
  const org=cachedOrganizationSettings(),doc=new jsPDF({unit:"mm",format:"a4"}),green=[21,61,52] as [number,number,number],orange=[255,117,66] as [number,number,number];
  const revenue=Number(summary.revenue||0),cost=Number(summary.cost||0),expenses=Number(summary.expenses||0),gross=revenue-cost,net=gross-expenses,margin=revenue?gross/revenue*100:0,fmt=(n:number)=>`${org.currency} ${n.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  doc.setFillColor(...green);doc.rect(0,0,210,34,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(19);doc.text(org.name,14,14);doc.setFontSize(11);doc.text("Management summary",14,22);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text(`${from} to ${to} | Generated ${new Date().toLocaleString()}`,14,28);doc.setTextColor(24,38,33);
  const cards=[ ["Revenue",fmt(revenue)],["Gross profit",fmt(gross)],["Net profit",fmt(net)],["Margin",`${margin.toFixed(1)}%`] ];cards.forEach((c,i)=>{const x=14+i*47;doc.setFillColor(244,248,246);doc.roundedRect(x,40,43,23,2,2,"F");doc.setFontSize(7);doc.setTextColor(100,115,108);doc.text(c[0],x+4,47);doc.setFontSize(11);doc.setFont("helvetica","bold");doc.setTextColor(24,55,46);doc.text(c[1],x+4,56,{maxWidth:36});doc.setFont("helvetica","normal")});
  doc.setFontSize(11);doc.setFont("helvetica","bold");doc.text("Daily revenue and gross profit",14,73);const daily=detail.daily||[],max=Math.max(1,...daily.map((x:any)=>Number(x.revenue)));daily.slice(-14).forEach((x:any,i:number)=>{const bx=15+i*12.8,rh=28*Number(x.revenue)/max,ph=28*Math.max(0,Number(x.profit))/max;doc.setFillColor(...green);doc.rect(bx,105-rh,5.2,rh,"F");doc.setFillColor(...orange);doc.rect(bx+5.2,105-ph,5.2,ph,"F");doc.setFontSize(5.5);doc.setTextColor(95);doc.text(new Date(x.date).toLocaleDateString(undefined,{month:"short",day:"numeric"}),bx,110,{angle:35})});doc.setFontSize(7);doc.setTextColor(...green);doc.text("Revenue",156,73);doc.setTextColor(...orange);doc.text("Gross profit",177,73);
  autoTable(doc,{startY:119,head:[["Profit and loss","Amount"]],body:[["Posted sales revenue",fmt(revenue)],["Cost of goods sold",fmt(cost)],["Gross profit",fmt(gross)],["Operating expenses",fmt(expenses)],["Net profit",fmt(net)]],theme:"grid",headStyles:{fillColor:green},styles:{fontSize:8}});
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+7,head:[["Top seller","Qty","Revenue","Profit"]],body:(detail.topSellers||[]).slice(0,8).map((x:any)=>[x.name,Number(x.quantity).toLocaleString(),fmt(Number(x.revenue)),fmt(Number(x.profit))]),theme:"striped",headStyles:{fillColor:green},styles:{fontSize:7.5}});
  doc.addPage();doc.setFillColor(...green);doc.rect(0,0,210,18,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(13);doc.text("Operations detail",14,12);doc.setTextColor(25);doc.setFont("helvetica","normal");
  autoTable(doc,{startY:25,head:[["Payment method","Collected"]],body:(detail.paymentMix||[]).map((x:any)=>[x.name,fmt(Number(x.amount))]),theme:"grid",headStyles:{fillColor:green},styles:{fontSize:8}});
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+7,head:[["Low stock item","Category","Stock","Minimum","Sell price"]],body:(detail.lowStock||[]).map((x:any)=>[x.name,x.category,String(x.stock),String(x.minStock),fmt(Number(x.sellingPrice))]),theme:"striped",headStyles:{fillColor:orange},styles:{fontSize:7.5}});
  autoTable(doc,{startY:(doc as any).lastAutoTable.finalY+7,head:[["Expense","Category","Amount","Paid","Method"]],body:(detail.expenseRecords||[]).slice(0,30).map((x:any)=>[x.description,x.category,fmt(Number(x.amount)),fmt(Number(x.paidAmount)),x.method]),theme:"grid",headStyles:{fillColor:green},styles:{fontSize:7}});
  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(110);doc.text(`Dukora - ${org.name} - Page ${p} of ${pages}`,105,291,{align:"center"})}doc.save(`Dukora-report-${from}-to-${to}.pdf`);
}
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
  return (
    <div className={`spec-kpis count-${items.length}`}>
      {items.map((x) => (
        <article key={x[0]} className={onSelect?"interactive-kpi":""} onClick={()=>onSelect?.(x[0])} role={onSelect?"button":undefined} tabIndex={onSelect?0:undefined}>
          <small>{x[0]}</small>
          <b>{x[1]}</b>
          <em>{x[2]}</em>
        </article>
      ))}
    </div>
  );
}
function Two({ children }: { children: ReactNode }) {
  return <div className="spec-two">{children}</div>;
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="spec-panel">
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
function Table({ heads, rows }: { heads: string[]; rows: string[][] }) {
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
  return (
    <div className="spec-table-wrap">
      <table className="spec-table">
        <thead>
          <tr>
            {heads.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              className={`${r.includes("Debt") ? "row-debt" : ""} ${r.includes("Watch") ? "row-watch" : ""}`}
              key={i}
            >
              {r.map((x, j) => (
                <td key={j}>
                  {j === r.length - 1 && statuses.includes(x) ? (
                    <span className={`badge ${x.toLowerCase()}`}>{x}</span>
                  ) : (
                    x
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
