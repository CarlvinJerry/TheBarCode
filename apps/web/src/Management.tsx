import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
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
  getOperationalOverview,
  getSummary,
  getStaff,
  getSettings,
  removeDemo,
  resetDemo,
  saveBranch,
  saveOrganization,
  saveReceiptConfiguration,
  saveTerminalConfiguration,
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
};
export function Management({ view, products, user, notify }: Props) {
  if (view === "Dashboard") return <Dashboard products={products} />;
  if (view === "Inventory")
    return <Inventory products={products} user={user} notify={notify} />;
  if (view === "Customers") return <Customers />;
  if (view === "Expenses") return <Expenses />;
  if (view === "Reports") return <Reports />;
  if (view === "Smart insights") return <SmartInsights />;
  if (view === "Audit" || view === "Audit trail") return <Audit />;
  if (["Staff", "Users & roles", "Staff & roles"].includes(view))
    return <Staff notify={notify} />;
  if (view === "Item setup") return <ItemSetup notify={notify} />;
  return <Settings user={user} notify={notify} />;
}
function Dashboard({ products }: { products: Product[] }) {
  const [overview, setOverview] = useState<any>(null);
  useEffect(() => {
    const to = new Date(),
      from = new Date(Date.now() - 6 * 86400000);
    getOperationalOverview(from.toISOString().slice(0,10),to.toISOString().slice(0,10)).then(setOverview).catch(() => 0);
  }, []);
  const daily = (overview?.daily ?? []).map((d:any)=>({day:new Date(d.date).toLocaleDateString("en",{weekday:"short"}),revenue:d.revenue,profit:d.profit}));
  const margin=overview?.revenue ? overview.grossProfit/overview.revenue*100 : 0;
  return (
    <Page>
      <Kpis
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
    [form, setForm] = useState({ name: "", phone: "", creditLimit: 0 });
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
  const rows = ranked.map((x) => [
        x.name,
        x.phone || "—",
        money(x.totalSpent),
        money(x.debt),
        x.lastVisit ? new Date(x.lastVisit).toLocaleDateString() : "—",
        x.debt > 0 ? "Debt" : "Clear",
      ]);
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
      <Panel title="Customer directory">
        <Table
          heads={[
            "Customer",
            "Phone",
            "Money spent",
            "Debt",
            "Last visit",
            "Risk",
          ]}
          rows={rows}
        />
      </Panel>
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
  const [range, setRange] = useState("This month"),[from,setFrom]=useState(month.toISOString().slice(0,10)),[to,setTo]=useState(today),[summary,setSummary]=useState<any>(null);
  const load=()=>getSummary(from,to).then(setSummary).catch(()=>setSummary(null));useEffect(()=>{void load()},[]);
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
        <Panel title="Excel management pack">
          <div className="export-card">
            <i>⇩</i>
            <p>
              Download a formatted workbook containing KPI cards, revenue and
              expense charts, sales, inventory, customers, and source tables.
            </p>
            <button onClick={()=>downloadExcel({from,to,...summary,grossProfit:gross,netProfit:net})}>
              ⇩ Download Excel with visuals
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
    <Panel title="How analysis works"><p>Without server AI credentials, Dukora always uses its built-in deterministic rules. To enable optional AI analysis, set <code>Insights__Endpoint</code>, <code>Insights__Model</code> and <code>Insights__ApiKey</code> on the local server or hosted API, then restart it. Keys are never stored in the browser.</p></Panel>
  </Page>
}
function Audit() {
  const [remote, setRemote] = useState<any[]>([]);
  useEffect(() => {
    getAudit()
      .then(setRemote)
      .catch(() => setRemote([]));
  }, []);
  const rows = remote.map(x=>[new Date(x.occurredAt).toLocaleString(),x.actor,`${x.action} ${x.entityType}`,x.details,x.deviceId||"Server","Synced"]);
  return (
    <Page>
      <Intro
        title="Audit trail"
        text="Every sensitive action is timestamped with user, device and sync status."
      />
      <Filter>
        <select>
          <option>All actions</option>
          <option>Sales</option>
          <option>Stock</option>
        </select>
        <select>
          <option>All users</option>
          {Array.from(new Set(remote.map(x=>x.actor))).map(x=><option key={String(x)}>{String(x)}</option>)}
        </select>
        <input type="date" defaultValue={new Date().toISOString().slice(0,10)} />
        <button>Filter log</button>
      </Filter>
      <Panel title="Recent activity">
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
    [form, setForm] = useState({ name: "", pin: "", role: "Cashier" });
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
  const display = rows.map((x) => [
        x.name,
        x.role,
        x.role === "Owner" || x.role === "Manager" ? "Yes" : "No",
        x.role === "Owner" || x.role === "Storekeeper" ? "Yes" : "No",
        x.role === "Owner" || x.role === "Manager" ? "Yes" : "No",
        "—",
        x.active?"Active":"Inactive",
      ]);
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
      <Panel title="Team & access">
        <Table
          heads={[
            "Name",
            "Role",
            "Discount",
            "Stock",
            "Reports",
            "Revenue",
            "Status",
          ]}
          rows={display}
        />
      </Panel>
    </Page>
  );
}
function ItemSetup({ notify }: { notify: (x: string) => void }) {
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
  useEffect(() => {
    getSettings().then((data)=>{setOrganization(data.organization);setReceiptConfig(data.receipt);setBranches(data.branches);setTerminals(data.terminals);localStorage.setItem("organization_profile",JSON.stringify(data.organization));localStorage.setItem("receipt_configuration",JSON.stringify(data.receipt));if(!branchId&&data.branches.length)setBranchId(data.branches[0].id)}).catch(()=>notify("Shared settings unavailable · using saved terminal configuration"));
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
function downloadExcel(report:any = {}) {
  const data = [
    ["Dukora management report", `${report.from??""} to ${report.to??""}`],
    ["Line","Amount"],
    ["Sales revenue",report.revenue??0],
    ["Cost of goods",report.cost??0],
    ["Gross profit",report.grossProfit??0],
    ["Expenses",report.expenses??0],
    ["Net profit",report.netProfit??0],
  ].map(x=>x.join("\t")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([data], { type: "application/vnd.ms-excel" }),
  );
  a.download = "Dukora-management-pack.xls";
  a.click();
  URL.revokeObjectURL(a.href);
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
function Kpis({ items }: { items: string[][] }) {
  return (
    <div className={`spec-kpis count-${items.length}`}>
      {items.map((x) => (
        <article key={x[0]}>
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
