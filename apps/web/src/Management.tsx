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
import { printReceiptText, testReceiptText } from "./receiptPrinter";
import {
  bootstrap,
  createProduct,
  createStaff,
  getAudit,
  getCustomerSummary,
  getDailyReport,
  getStaff,
  removeDemo,
  resetDemo,
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
const expenses = [
  {
    description: "Beer supplier top-up",
    category: "Inventory",
    amount: 8200,
    status: "Paid",
  },
  {
    description: "Electricity tokens",
    category: "Utilities",
    amount: 1500,
    status: "Paid",
  },
  {
    description: "Casual shift",
    category: "Staff",
    amount: 2200,
    status: "Paid",
  },
  {
    description: "Fridge repair",
    category: "Maintenance",
    amount: 3200,
    status: "Pending",
  },
];
const customers = [
  ["Brian Otieno", "0712 345 678", "KES 2,450", "12 Aug", "Debt"],
  ["Mercy Njeri", "0798 111 222", "Clear", "Today", "Clear"],
  ["Kariuki Table", "0701 202 303", "KES 5,900", "Yesterday", "Debt"],
  ["Amina Said", "0733 889 900", "Clear", "18 Aug", "Clear"],
  ["Victor Barasa", "0722 333 444", "KES 1,200", "16 Aug", "Watch"],
];
const week = [
  { day: "M", sales: 18400 },
  { day: "T", sales: 22100 },
  { day: "W", sales: 19800 },
  { day: "T ", sales: 26500 },
  { day: "F", sales: 48620 },
  { day: "S", sales: 39200 },
  { day: "S ", sales: 35400 },
];
const categoryValues = [
  { name: "Beer", value: 86400 },
  { name: "Spirits", value: 71800 },
  { name: "Coffee", value: 45200 },
  { name: "Food", value: 62400 },
  { name: "Soft drinks", value: 38600 },
];
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
  if (view === "Audit" || view === "Audit trail") return <Audit />;
  if (["Staff", "Users & roles", "Staff & roles"].includes(view))
    return <Staff notify={notify} />;
  if (view === "Item setup") return <ItemSetup notify={notify} />;
  return <Settings user={user} notify={notify} />;
}
function Dashboard({ products }: { products: Product[] }) {
  const local = useLiveQuery(() => db.sales.toArray(), []) ?? [];
  const fallback = week.map((x, i) => ({
    day: x.day,
    revenue: x.sales,
    profit: Math.round(x.sales * (0.28 + i * 0.01)),
  }));
  const [daily, setDaily] = useState(fallback);
  useEffect(() => {
    const to = new Date(),
      from = new Date(Date.now() - 6 * 86400000);
    getDailyReport(
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
    )
      .then((x: any[]) => {
        if (x.length)
          setDaily(
            x.map((d) => ({
              day: new Date(d.date)
                .toLocaleDateString("en", { weekday: "short" })
                .slice(0, 1),
              revenue: d.revenue,
              profit: d.profit,
            })),
          );
      })
      .catch(() => 0);
  }, []);
  const todayRevenue =
    local
      .filter(
        (x) =>
          new Date(x.occurredAt).toDateString() === new Date().toDateString(),
      )
      .reduce((s, x) => s + x.total, 0) || 48620;
  return (
    <Page>
      <Kpis
        items={[
          ["Today’s sales", money(todayRevenue), "↑ 12.4%"],
          ["Gross profit", money(16840), "34.6% margin"],
          [
            "Customer credit",
            money(
              local
                .filter((x) => x.status === "Credit")
                .reduce((s, x) => s + x.total, 0) || 9550,
            ),
            "Open customer balances",
          ],
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
            data={[
              ["Cash", 25400],
              ["M-Pesa", 12820],
              ["Credit", 10400],
            ]}
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
            rows={[
              ["Tusker Lager", "24", "KES 7,680"],
              ["White Cap", "21", "KES 7,350"],
              ["Guinness", "18", "KES 6,840"],
              ["Heineken", "15", "KES 6,300"],
            ]}
          />
        </Panel>
        <Panel title="Activity">
          <div className="activity">
            {[
              ["Kevin recorded sale #1047", "3 min ago"],
              ["Musa restocked White Cap", "17 min ago"],
              ["Sharon received M-Pesa", "31 min ago"],
              ["Admin closed yesterday’s shift", "45 min ago"],
            ].map((x) => (
              <p key={x[0]}>
                <i />
                <span>
                  <b>{x[0]}</b>
                  <small>{x[1]}</small>
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
  const chart = categoryValues.map((x) => ({ ...x, label: money(x.value) }));
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
  const rows = ranked.length
    ? ranked.map((x) => [
        x.name,
        x.phone || "—",
        money(x.totalSpent),
        money(x.debt),
        x.lastVisit ? new Date(x.lastVisit).toLocaleDateString() : "—",
        x.debt > 0 ? "Debt" : "Clear",
      ])
    : customers.map((x) => [x[0], x[1], "KES 0", x[2], x[3], x[4]]);
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
  const [category, setCategory] = useState("All");
  const rows =
    category === "All"
      ? expenses
      : expenses.filter((x) => x.category === category);
  return (
    <Page>
      <Intro
        title="Expenses & suppliers"
        text="Explore costs by period, category and payment status."
        action="＋ New expense"
      />
      <Filter>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {["All", "Inventory", "Utilities", "Staff", "Maintenance"].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <input type="date" defaultValue="2026-08-01" />
        <span>to</span>
        <input type="date" defaultValue="2026-08-21" />
        <button>Apply filters</button>
      </Filter>
      <Kpis
        items={[
          [
            "Filtered total",
            money(rows.reduce((s, x) => s + x.amount, 0)),
            `${rows.length} records`,
          ],
          ["Supplier balances", "KES 21,500", "3 suppliers"],
          ["Cash expenses", "KES 7,800", "18% of total"],
        ]}
      />
      <Two>
        <Panel title="Expenses by category">
          <Chart>
            <BarChart
              data={[
                { name: "Stock", v: 18200 },
                { name: "Utility", v: 6500 },
                { name: "Staff", v: 9200 },
                { name: "Ops", v: 4100 },
                { name: "Rent", v: 4600 },
              ]}
            >
              <CartesianGrid vertical={false} stroke="#e4ebe7" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="v" fill="#ff7542" radius={[5, 5, 0, 0]} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Monthly expense trend">
          <Chart>
            <LineChart
              data={[
                { m: "Mar", v: 38000 },
                { m: "Apr", v: 41200 },
                { m: "May", v: 35600 },
                { m: "Jun", v: 44100 },
                { m: "Jul", v: 42600 },
              ]}
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
            x.status,
          ])}
        />
      </Panel>
    </Page>
  );
}
function Reports() {
  const [range, setRange] = useState("This month");
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
        <input type="date" defaultValue="2026-08-01" />
        <span>to</span>
        <input type="date" defaultValue="2026-08-21" />
        <button className="apply">Refresh report</button>
      </div>
      <Kpis
        items={[
          ["Revenue", "KES 170,120", "7 days"],
          ["Cost of goods", "KES 112,780", "66.3%"],
          ["Gross profit", "KES 57,340", "33.7%"],
          ["Expenses", "KES 46,500", "Selected range"],
        ]}
      />
      <Two>
        <Panel title="Profit & loss">
          <Table
            heads={["Line", "Amount"]}
            rows={[
              ["Sales revenue", "KES 170,120"],
              ["Cost of goods", "(KES 112,780)"],
              ["Gross profit", "KES 57,340"],
              ["Expenses", "(KES 46,500)"],
              ["Net profit", "KES 10,840"],
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
            <button onClick={downloadExcel}>
              ⇩ Download Excel with visuals
            </button>
          </div>
        </Panel>
      </Two>
    </Page>
  );
}
function Audit() {
  const [remote, setRemote] = useState<any[]>([]);
  useEffect(() => {
    getAudit()
      .then(setRemote)
      .catch(() => setRemote([]));
  }, []);
  const rows = [
    [
      "20:42:11",
      "Kevin",
      "Recorded cash sale",
      "Sale #1047",
      "Tablet 01",
      "Synced",
    ],
    [
      "20:38:04",
      "Sharon",
      "Applied discount · KES 100",
      "Sale #1046",
      "Tablet 02",
      "Synced",
    ],
    [
      "20:31:55",
      "Musa",
      "Stock adjustment · −2",
      "Guinness",
      "Store phone",
      "Queued",
    ],
    [
      "20:15:09",
      "Admin",
      "Changed selling price",
      "Cappuccino",
      "Office laptop",
      "Synced",
    ],
    [
      "19:58:31",
      "Kevin",
      "Opened customer credit",
      "Brian Otieno",
      "Tablet 01",
      "Synced",
    ],
    [
      "19:22:18",
      "Musa",
      "Recorded wastage · −3",
      "Fresh milk",
      "Store phone",
      "Queued",
    ],
  ];
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
          <option>Kevin</option>
          <option>Sharon</option>
          <option>Musa</option>
        </select>
        <input type="date" defaultValue="2026-08-21" />
        <button>Filter log</button>
      </Filter>
      <Panel title="Recent activity">
        <Table
          heads={["Time", "User", "Action", "Record", "Device", "Sync"]}
          rows={rows}
        />
      </Panel>
      <span className="sr-only">{remote.length} central entries</span>
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
  const display = rows.length
    ? rows.map((x, i) => [
        x.name,
        x.role,
        x.role === "Owner" || x.role === "Manager" ? "Yes" : "No",
        x.role === "Owner" || x.role === "Storekeeper" ? "Yes" : "No",
        x.role === "Owner" || x.role === "Manager" ? "Yes" : "No",
        i ? money([21480, 17920, 9220][i % 3]) : "—",
        "Active",
      ])
    : [
        ["Admin", "Owner", "Yes", "Yes", "Yes", "—", "Active"],
        ["Kevin", "Cashier", "No", "No", "No", "KES 21,480", "Active"],
        ["Sharon", "Manager", "Yes", "No", "Yes", "KES 17,920", "Active"],
        ["Musa", "Storekeeper", "No", "Yes", "No", "KES 9,220", "Active"],
      ];
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
  const [theme, setTheme] = useState(localStorage.getItem("theme") ?? "Forest"),
    [business, setBusiness] = useState(
      localStorage.getItem("business_name") || "The BarCode",
    ),
    [footer, setFooter] = useState(
      localStorage.getItem("receipt_footer") || "Thank you. Drink responsibly.",
    );
  function choose(x: string) {
    setTheme(x);
    localStorage.setItem("theme", x);
    document.documentElement.dataset.theme = x.toLowerCase();
  }
  function saveBusiness(name: string, foot: string) {
    localStorage.setItem("business_name", name);
    localStorage.setItem("receipt_footer", foot);
    notify("Receipt identity saved on this terminal");
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
      <Two>
        <Panel title="Receipt printer">
          <div className="device-row">
            <i>▤</i>
            <span>
            <b>XP-P5 / P510 Portable</b>
              <small>Windows queue · USB or Bluetooth</small>
            </span>
            <em>Configured</em>
          </div>
          <button
            className="outline-button"
            onClick={() => printReceiptText(testReceiptText())}
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
        <Panel title="This terminal">
          <div className="settings-fields">
            <Field label="Device name">
              <input
                defaultValue="Tablet 01"
                onChange={(e) =>
                  localStorage.setItem("device_id", e.target.value)
                }
              />
            </Field>
            <Field label="Location">
              <input defaultValue="Main bar" />
            </Field>
            <Field label="Receipt width">
              <select defaultValue="58mm">
                <option>58mm</option>
                <option>80mm</option>
              </select>
            </Field>
          </div>
        </Panel>
        <Panel title="Business profile">
          <div className="settings-fields">
            <Field label="Institution / business name">
              <input
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
              />
            </Field>
            <Field label="Currency">
              <select defaultValue="KES">
                <option>KES</option>
              </select>
            </Field>
            <Field label="Receipt footer">
              <input
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
              />
            </Field>
            <button
              className="outline-button"
              onClick={() => saveBusiness(business, footer)}
            >
              Save receipt identity
            </button>
          </div>
        </Panel>
      </Two>
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
function downloadExcel() {
  const data =
    "Line\tAmount\nSales revenue\t170120\nCost of goods\t112780\nGross profit\t57340\nExpenses\t46500\nNet profit\t10840";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([data], { type: "application/vnd.ms-excel" }),
  );
  a.download = "TheBarcode-management-pack.xls";
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
