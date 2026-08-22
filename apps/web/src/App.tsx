import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { bootstrap, login, session, syncOutbox } from "./api";
import {
  db,
  queueCustomer,
  queueSale,
  type Customer,
  type Product,
  type Staff,
} from "./db";
import { Management } from "./Management";
import { printReceiptText } from "./receiptPrinter";
import { APP_VERSION } from "./version";
import "./App.css";

type CartLine = Product & { quantity: number };
const money = (n: number) => `KES ${n.toLocaleString()}`;
export default function App() {
  const products =
    useLiveQuery(() => db.products.filter((x) => x.active).toArray(), []) ?? [];
  const staff = useLiveQuery(() => db.staff.toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];
  const queued = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const [user, setUser] = useState(session.user),
    [view, setView] = useState("Sell"),
    [cart, setCart] = useState<CartLine[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [message, setMessage] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [receipt, setReceipt] = useState<string>(),
    [selectedCustomer, setSelectedCustomer] = useState<Customer>(),
    [customerOpen, setCustomerOpen] = useState(false),
    [collapsed, setCollapsed] = useState(
      localStorage.getItem("sidebar_collapsed") === "true",
    );
  useEffect(() => {
    document.documentElement.dataset.theme = (
      localStorage.getItem("theme") || "Forest"
    ).toLowerCase();
    bootstrap().catch(() => setMessage("Offline mode · using saved catalogue"));
    const change = () => setOnline(navigator.onLine);
    addEventListener("online", change);
    addEventListener("offline", change);
    const timer = setInterval(() => syncOutbox().catch(() => 0), 15000);
    return () => {
      removeEventListener("online", change);
      removeEventListener("offline", change);
      clearInterval(timer);
    };
  }, []);
  const visibleProducts = products.filter((p) =>
    user?.name === "Demo User" ? p.isDemo : !p.isDemo,
  );
  const filtered = visibleProducts.filter(
    (p) =>
      p.sellable &&
      (category === "All" || p.category === category) &&
      `${p.name} ${p.barcode ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const total = useMemo(
    () => cart.reduce((s, x) => s + x.quantity * x.sellingPrice, 0),
    [cart],
  );
  if (!user) return <Login staff={staff} onLogin={setUser} message={message} />;
  const add = (p: Product) =>
    setCart((c) =>
      c.some((x) => x.id === p.id)
        ? c.map((x) => (x.id === p.id ? { ...x, quantity: x.quantity + 1 } : x))
        : [...c, { ...p, quantity: 1 }],
    );
  const qty = (id: string, d: number) =>
    setCart((c) =>
      c
        .map((x) => (x.id === id ? { ...x, quantity: x.quantity + d } : x))
        .filter((x) => x.quantity > 0),
    );
  async function checkout(method: string) {
    if (!cart.length) return;
    if (method === "Credit" && !selectedCustomer) {
      setCustomerOpen(true);
      setMessage("Choose or register a customer before recording credit");
      return;
    }
    const id = crypto.randomUUID(),
      credit = method === "Credit",
      institution = localStorage.getItem("business_name") || "The BarCode",
      customerName = selectedCustomer?.name || "Walk-in customer";
    await queueSale({
      deviceTransactionId: id,
      customerId: selectedCustomer?.id,
      staffId: user.id,
      status: credit ? "Credit" : "Paid",
      discount: 0,
      occurredAt: new Date().toISOString(),
      deviceId: localStorage.getItem("device_id") ?? "windows-pos-01",
      items: cart.map((x) => ({
        productId: x.id,
        productName: x.name,
        quantity: x.quantity,
        unitPrice: x.sellingPrice,
        unitCost: x.costPrice,
        discount: 0,
      })),
      payments: credit ? [] : [{ method, amount: total }],
      total,
      synced: false,
    });
    setReceipt(
      `${institution.toUpperCase()}\nCustomer: ${customerName}\nReceipt ${id.slice(0, 8).toUpperCase()}\n${cart.map((x) => `${x.quantity} x ${x.name}  ${money(x.quantity * x.sellingPrice)}`).join("\n")}\n----------------------------\nTOTAL  ${money(total)}\n${method.toUpperCase()}\n${localStorage.getItem("receipt_footer") || "Thank you. Drink responsibly."}`,
    );
    setCart([]);
    setSelectedCustomer(undefined);
    setMessage("Sale saved safely on this device");
    syncOutbox().catch(() => 0);
  }
  const views = [
    "Sell",
    "Dashboard",
    "Inventory",
    "Customers",
    "Expenses",
    "Reports",
    "Audit trail",
    "Staff & roles",
    "Item setup",
    "Settings",
  ];
  const icons: Record<string, string> = {
    Sell: "▦",
    Dashboard: "◫",
    Inventory: "▤",
    Customers: "♙",
    Expenses: "▧",
    Reports: "⌁",
    "Audit trail": "≡",
    "Staff & roles": "♟",
    "Item setup": "＋",
    Settings: "⚙",
  };
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(new Date())
    .toUpperCase();
  const pageTitle = view === "Sell" ? "New sale" : view;
  function logout() {
    session.clear();
    setCart([]);
    setSelectedCustomer(undefined);
    setUser(null);
  }
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  }
  return (
    <div className={`shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside>
        <div className="brand">
          <i>B</i>
          <span>
            <b>The BarCode</b>
            <small>Smart bar operations</small>
          </span>
          <button
            className="collapse-sidebar"
            onClick={toggleSidebar}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            ☰
          </button>
        </div>
        <nav aria-label="Main navigation">
          {views.map((x) => (
            <button
              className={view === x ? "active" : ""}
              onClick={() => setView(x)}
              key={x}
            >
              <i>{icons[x]}</i>
              {x}
            </button>
          ))}
        </nav>
        <div className="user">
          <span>
            {user.name
              .split(" ")
              .map((x: string) => x[0])
              .join("")
              .slice(0, 2)}
          </span>
          <p>
            <b>{user.name}</b>
            <small>
              {user.role}
              {user.name === "Demo User" ? " · Demo" : ""}
            </small>
          </p>
          <button className="logout-button" onClick={logout} title="Sign out">
            ↪ <b>Sign out</b>
          </button>
        </div>
        <div className="builder-signoff">
          <span>Built by</span>
          <b>Beyond Raw Data</b>
          <small>v{APP_VERSION}</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>{today}</small>
            <h1>{pageTitle}</h1>
          </div>
          <div className="status">
            <span className={online ? "online" : "offline"}>
              {online ? "● Online" : "● Offline ready"} · {queued} queued
            </span>
            <span>◫ 0 held</span>
          </div>
        </header>
        {view === "Sell" ? (
          <div className="sell">
            <section className="catalogue">
              <div className="search">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search or scan a product…"
                  autoFocus
                />
                <button>⌗ Scan</button>
              </div>
              <div className="categories">
                {[
                  "All",
                  ...new Set(
                    visibleProducts
                      .filter((x) => x.sellable)
                      .map((x) => x.category),
                  ),
                ].map((x) => (
                  <button
                    className={category === x ? "selected" : ""}
                    onClick={() => setCategory(x)}
                    key={x}
                  >
                    {x}{" "}
                    <small>
                      {x === "All"
                        ? visibleProducts.filter((p) => p.sellable).length
                        : visibleProducts.filter(
                            (p) => p.sellable && p.category === x,
                          ).length}
                    </small>
                  </button>
                ))}
              </div>
              <div className="section-label">
                <h2>Popular items</h2>
                <span>Tap to add</span>
              </div>
              <div className="products">
                {filtered.map((p) => (
                  <button onClick={() => add(p)} key={p.id}>
                    <span
                      className={`tile ${p.stock <= p.minStock ? "low" : ""}`}
                    >
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="product-copy">
                      <b>{p.name}</b>
                      <small>
                        {p.category} · {p.unit}
                      </small>
                    </span>
                    <span className="product-price">
                      <strong>{money(p.sellingPrice)}</strong>
                      <em>{p.stock} in stock</em>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="bill">
              <div className="bill-title">
                <span>
                  <small>CURRENT ORDER</small>
                  <h2>Bill #{1048}</h2>
                </span>
                <button onClick={() => setCart([])}>⌫</button>
              </div>
              <button
                className="customer-pick"
                onClick={() => setCustomerOpen(true)}
              >
                <i>{selectedCustomer?.name[0] || "W"}</i>
                <span>
                  <b>{selectedCustomer?.name || "Walk-in customer"}</b>
                  <small>
                    {selectedCustomer
                      ? "Registered customer · tap to change"
                      : "Add customer or use credit"}
                  </small>
                </span>
                <em>›</em>
              </button>
              <div className="lines">
                {!cart.length && (
                  <p className="empty">Tap a product to begin.</p>
                )}
                {cart.map((x) => (
                  <div className="line" key={x.id}>
                    <span>
                      <b>{x.name}</b>
                      <small>{money(x.sellingPrice)} each</small>
                      <i>
                        <button onClick={() => qty(x.id, -1)}>−</button>
                        {x.quantity}
                        <button onClick={() => qty(x.id, 1)}>+</button>
                      </i>
                    </span>
                    <strong>{money(x.quantity * x.sellingPrice)}</strong>
                  </div>
                ))}
              </div>
              <div className="summary-line">
                <span>Subtotal</span>
                <b>{money(total)}</b>
              </div>
              <div className="summary-line">
                <span>Discount</span>
                <button>＋ Add</button>
              </div>
              <div className="total">
                <span>Total</span>
                <b>{money(total)}</b>
              </div>
              <div className="pay">
                <button onClick={() => checkout("Cash")}>▣ Cash</button>
                <button onClick={() => checkout("M-Pesa")}>▤ M-Pesa</button>
                <button className="credit" onClick={() => checkout("Credit")}>
                  ◴ Credit
                </button>
              </div>
              <button className="charge" onClick={() => checkout("Cash")}>
                Charge {money(total)} →
              </button>
              <div className="bill-actions">
                <button>▧ Hold bill</button>
                <button
                  onClick={() =>
                    cart.length &&
                    printReceiptText(
                      `${(localStorage.getItem("business_name") || "The BarCode").toUpperCase()}\nCustomer: ${selectedCustomer?.name || "Walk-in customer"}\nCURRENT BILL\n${cart.map((x) => `${x.quantity} x ${x.name}  ${money(x.quantity * x.sellingPrice)}`).join("\n")}\n----------------------------\nTOTAL  ${money(total)}`,
                    )
                  }
                >
                  ▤ Print bill
                </button>
              </div>
            </section>
          </div>
        ) : (
          <Management
            view={view}
            products={visibleProducts}
            user={user}
            notify={setMessage}
          />
        )}{" "}
      </main>
      {message && (
        <div className="toast" onClick={() => setMessage("")}>
          {message}
        </div>
      )}
      {customerOpen && (
        <CustomerPicker
          customers={customers}
          onClose={() => setCustomerOpen(false)}
          onSelect={(x) => {
            setSelectedCustomer(x);
            setCustomerOpen(false);
          }}
        />
      )}
      {receipt && (
        <div className="modal">
          <section>
            <button className="close" onClick={() => setReceipt(undefined)}>
              ×
            </button>
            <pre id="receipt">{receipt}</pre>
            <button className="print" onClick={() => printReceiptText(receipt)}>
              Print receipt
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function Login({
  staff,
  onLogin,
  message,
}: {
  staff: Staff[];
  onLogin: (u: any) => void;
  message: string;
}) {
  const [staffId, setStaffId] = useState(""),
    [pin, setPin] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (staff.length && !staffId) setStaffId(staff[0].id);
  }, [staff, staffId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      onLogin(await login(staffId, pin));
    } catch {
      setError("Unable to sign in. Check the PIN and server connection.");
    }
  }
  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="login-brand">B</div>
        <h1>The BarCode</h1>
        <p>Smart bar operations</p>
        <label>
          Staff
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staff.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.role}
              </option>
            ))}
          </select>
        </label>
        <label>
          PIN
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <button>Sign in</button>
        <div className="demo-hint">
          <b>Demo account</b>
          <span>Demo User · PIN 123456</span>
        </div>
        {(error || message) && <small>{error || message}</small>}
      </form>
    </div>
  );
}
function CustomerPicker({
  customers,
  onClose,
  onSelect,
}: {
  customers: Customer[];
  onClose: () => void;
  onSelect: (x?: Customer) => void;
}) {
  const [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false),
    [form, setForm] = useState({ name: "", phone: "", creditLimit: 0 });
  const shown = customers.filter((x) =>
    `${x.name} ${x.phone ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const customer: Customer = {
      id: crypto.randomUUID(),
      name: form.name,
      phone: form.phone,
      creditLimit: form.creditLimit,
      notes: "Created at POS",
    };
    await queueCustomer(customer);
    syncOutbox().catch(() => 0);
    onSelect(customer);
  }
  return (
    <div className="modal customer-modal">
      <section>
        <button className="close" onClick={onClose}>
          ×
        </button>
        <h2>Select customer</h2>
        <button className="walkin-choice" onClick={() => onSelect(undefined)}>
          W{" "}
          <span>
            <b>Walk-in customer</b>
            <small>No customer account</small>
          </span>
        </button>
        {!creating ? (
          <>
            <input
              className="customer-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone…"
            />
            <div className="customer-list">
              {shown.map((x) => (
                <button onClick={() => onSelect(x)} key={x.id}>
                  <i>{x.name[0]}</i>
                  <span>
                    <b>{x.name}</b>
                    <small>
                      {x.phone || "No phone"} · Limit {money(x.creditLimit)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <button className="new-customer" onClick={() => setCreating(true)}>
              ＋ Register new customer
            </button>
          </>
        ) : (
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
            <button>Save and select</button>
          </form>
        )}
      </section>
    </div>
  );
}
