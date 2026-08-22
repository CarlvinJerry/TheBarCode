import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { bootstrap, getLoginStaff, getNotifications, holdBill, login, postBill, session, syncOutbox, updateBill } from "./api";
import {
  db,
  queueCustomer,
  queueSale,
  type Customer,
  type Product,
  type Staff,
} from "./db";
import { Management } from "./Management";
import { buildSaleReceipt, cachedReceiptSettings, printReceiptText } from "./receiptPrinter";
import { APP_VERSION } from "./version";
import "./App.css";

type CartLine = Product & { quantity: number };
const money = (n: number) => `KES ${n.toLocaleString()}`;
export default function App() {
  const products =
    useLiveQuery(() => db.products.toArray(), []) ?? [];
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
    [receiptKind,setReceiptKind]=useState<"Unpaid"|"Paid"|"Credit">("Unpaid"),
    [selectedCustomer, setSelectedCustomer] = useState<Customer>(),
    [customerOpen, setCustomerOpen] = useState(false),
    [activeBill, setActiveBill] = useState<any>(),
    [notifications, setNotifications] = useState<Record<string, any>>({Total:0,Details:{}}),
    [alertsOpen,setAlertsOpen]=useState(false),
    [navigationLayout,setNavigationLayout]=useState(localStorage.getItem("navigation_layout")||"Vertical"),
    [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({Operations:false,"Data & Setup":false}),
    [collapsed, setCollapsed] = useState(
      localStorage.getItem("sidebar_collapsed") === "true",
    );
  const notificationRequest=useRef(0);
  useEffect(() => {
    document.documentElement.dataset.theme = (
      localStorage.getItem("theme") || "Forest"
    ).toLowerCase();
    (user?bootstrap():getLoginStaff()).catch(() => setMessage("Offline mode · using saved sign-in data"));
    const change = () => setOnline(navigator.onLine);
    addEventListener("online", change);
    addEventListener("offline", change);
    const navigationChanged=(event:Event)=>setNavigationLayout((event as CustomEvent<string>).detail);addEventListener("dukora:navigation-layout",navigationChanged);
    const timer = setInterval(() => syncOutbox().catch(() => 0), 15000);
    return () => {
      removeEventListener("online", change);
      removeEventListener("offline", change);
      removeEventListener("dukora:navigation-layout",navigationChanged);
      clearInterval(timer);
    };
  }, []);
  useEffect(()=>{if(!user)return;const refresh=async()=>{const request=++notificationRequest.current;try{const current=await getNotifications();if(request===notificationRequest.current)setNotifications(current)}catch{}};const attention=()=>void refresh();const visible=()=>{if(document.visibilityState==="visible")void refresh()};addEventListener("dukora:attention",attention);addEventListener("focus",attention);document.addEventListener("visibilitychange",visible);void refresh();const timer=setInterval(refresh,10000);return()=>{removeEventListener("dukora:attention",attention);removeEventListener("focus",attention);document.removeEventListener("visibilitychange",visible);clearInterval(timer)}},[user?.id]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(""),5000);return()=>clearTimeout(timer)},[message]);
  const messageIsError=/unable|failed|failure|could not|cannot|invalid|error|required|permission|expired|unavailable|refused|correction/i.test(message);
  const visibleProducts = products.filter((p) =>
    user?.isDemo ? p.isDemo : !p.isDemo,
  );
  const filtered = visibleProducts.filter(
    (p) =>
      p.active && p.sellable &&
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
  const billPayload=()=>({deviceTransactionId:activeBill?.deviceTransactionId||crypto.randomUUID(),customerId:selectedCustomer?.id,staffId:user.id,discount:0,notes:"POS order",deviceId:localStorage.getItem("device_id")??"windows-pos-01",items:cart.map(x=>({productId:x.id,quantity:x.quantity,unitPrice:x.sellingPrice,discount:0}))});
  async function ensureHeld(openPrint=false){
    if(!cart.length)return;
    try{
      const saved=activeBill?await updateBill(activeBill.id,{...billPayload(),reason:"Updated from active POS order",expectedRevision:activeBill.revision}):await holdBill(billPayload());setActiveBill(saved);dispatchEvent(new Event("dukora:attention"));
      const unpaid=buildSaleReceipt({id:String(saved.receiptNumber||saved.deviceTransactionId),dailyOrderNumber:saved.dailyOrderNumber,walkInNumber:saved.walkInNumber,customerName:selectedCustomer?.name||"Walk-in customer",cashierName:user.name,method:"Unpaid",status:"UNPAID",credit:true,items:cart.map(x=>({name:x.name,quantity:x.quantity,unitPrice:x.sellingPrice})),total});
      if(openPrint){setReceiptKind("Unpaid");setReceipt(`${unpaid}\nREVISION: ${saved.revision||1}`)}
      setMessage(`Bill #${saved.receiptNumber} is held and awaiting payment or credit${openPrint?" · confirm Print Unpaid Bill":""}`);return saved;
    }catch(error){setMessage(error instanceof Error?`Could not hold bill: ${error.message}`:"Could not hold bill on the shared server");}
  }
  async function checkout(method: string) {
    if (!cart.length) return;
    if (!activeBill) {
      setMessage("Print or hold the unpaid bill before posting payment or credit");
      return;
    }
    if (method === "Credit" && !selectedCustomer) {
      setCustomerOpen(true);
      setMessage("Choose or register a customer before recording credit");
      return;
    }
    const id = crypto.randomUUID(), credit = method === "Credit",
      customerName = selectedCustomer?.name || "Walk-in customer";
    try{
      const held=await updateBill(activeBill.id,{...billPayload(),reason:"Final POS revision before posting",expectedRevision:activeBill.revision});
      const dueAt=credit?new Date(Date.now()+7*86400000).toISOString():undefined;
      const posted=await postBill(held.id,{status:credit?"Credit":"Paid",method,amountPaid:credit?0:total,dueAt,notes:credit?"Credit approved at POS":"Paid at POS",deviceId:localStorage.getItem("device_id")??"windows-pos-01"});
      const receiptText=buildSaleReceipt({id:String(posted.receiptNumber||id),dailyOrderNumber:posted.dailyOrderNumber,walkInNumber:posted.walkInNumber,customerName,cashierName:user.name,method,status:credit?"CREDIT":"PAID",credit,items:cart.map(x=>({name:x.name,quantity:x.quantity,unitPrice:x.sellingPrice})),total});
      const receiptConfig=cachedReceiptSettings();setReceiptKind(credit?"Credit":"Paid");setReceipt(receiptText);if((!credit&&receiptConfig.autoPrintPaidSale)||(credit&&receiptConfig.creditSalePrintMode==="Automatic"))for(let copy=0;copy<receiptConfig.copies;copy++)await printReceiptText(receiptText);
      setCart([]);setSelectedCustomer(undefined);setActiveBill(undefined);setMessage(credit?"Credit invoice posted and added to follow-up":"Sale, payment and stock posted together");dispatchEvent(new Event("dukora:attention"));bootstrap().catch(()=>0);return;
    }catch(error){if(navigator.onLine){setMessage(error instanceof Error?error.message:"Sale could not be posted");return;}}
    await queueSale({
      deviceTransactionId: id,
      customerId: selectedCustomer?.id,
      staffId: user.id,
      status: credit ? "Credit" : "Paid",
      discount: 0,
      occurredAt: new Date().toISOString(),
      deviceId: localStorage.getItem("device_id") ?? "windows-pos-01",
      isDemo:Boolean(user.isDemo),
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
    const receiptText=buildSaleReceipt({id,customerName,cashierName:user.name,method,status:credit?"CREDIT":"PAID",credit,items:cart.map(x=>({name:x.name,quantity:x.quantity,unitPrice:x.sellingPrice})),total});
    const receiptConfig=cachedReceiptSettings();
    setReceiptKind(credit?"Credit":"Paid");setReceipt(receiptText);
    if((!credit&&receiptConfig.autoPrintPaidSale)||(credit&&receiptConfig.creditSalePrintMode==="Automatic"))for(let copy=0;copy<receiptConfig.copies;copy++)await printReceiptText(receiptText);
    setCart([]);
    setSelectedCustomer(undefined);
    setActiveBill(undefined);
    setMessage("Sale saved safely on this device");
    syncOutbox().catch(() => 0);
  }
  const primaryViews=["Sell","Dashboard","Bills","Inventory"];
  const menuGroups={Operations:["Expense","Reports","Audit trail"],"Data & Setup":["Customers","Staff & Roles","Item Setup"]};
  const icons: Record<string, string> = {
    Sell: "▦",
    Dashboard: "◫",
    Bills: "▥",
    Inventory: "▤",
    Customers: "♙",
    Expenses: "▧",
    Expense: "▧",
    Reports: "⌁",
    "Smart Insights": "✦",
    "Audit trail": "≡",
    "Staff & Roles": "♟",
    "Item Setup": "＋",
    Settings: "⚙",
  };
  const alertKeys:Record<string,string>={Bills:"Bills",Inventory:"Inventory",Customers:"Customers",Expenses:"Expenses",Expense:"Expenses","Audit trail":"AuditTrail",Settings:"Settings"};
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
    void getLoginStaff();
  }
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  }
  async function toggleFullscreen(){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  return (
    <div className={`shell ${collapsed ? "sidebar-collapsed" : ""} ${navigationLayout==="Horizontal"?"nav-horizontal":""}`}>
      <aside>
        <div className="brand">
          <img className="brand-lockup" src="/dukora-full-logo.png" alt="Dukora — Smarter Business Operations" />
          <img className="brand-logo" src="/dukora-logo.png" alt="Dukora" />
          <button
            className="collapse-sidebar"
            onClick={toggleSidebar}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            ☰
          </button>
        </div>
        <nav aria-label="Main navigation">
          {primaryViews.map((x) => (
            <button
              className={view === x ? "active" : ""}
              onClick={() => setView(x)}
              key={x}
            >
              <i>{icons[x]}</i>
              <span>{x}</span>{(notifications[alertKeys[x]]||0)>0&&<em className="menu-alert" title={`${notifications[alertKeys[x]]} items need attention`}>{notifications[alertKeys[x]]}</em>}
            </button>
          ))}
          {Object.entries(menuGroups).map(([group,items])=><div className="nav-group" key={group}><button className="nav-group-toggle" aria-expanded={expandedGroups[group]} onClick={()=>setExpandedGroups(x=>({...x,[group]:!x[group]}))}><i>{expandedGroups[group]?"▾":"▸"}</i><span>{group}</span>{items.reduce((sum,x)=>sum+(notifications[alertKeys[x]]||0),0)>0&&<em className="menu-alert">{items.reduce((sum,x)=>sum+(notifications[alertKeys[x]]||0),0)}</em>}</button>{expandedGroups[group]&&<div className="nav-submenu">{items.map(x=><button className={view===x?"active":""} onClick={()=>setView(x)} key={x}><i>{icons[x]}</i><span>{x}</span>{(notifications[alertKeys[x]]||0)>0&&<em className="menu-alert">{notifications[alertKeys[x]]}</em>}</button>)}</div>}</div>)}
          {["Smart Insights","Settings"].map(x=><button className={view===x?"active":""} onClick={()=>setView(x)} key={x}><i>{icons[x]}</i><span>{x}</span>{(notifications[alertKeys[x]]||0)>0&&<em className="menu-alert">{notifications[alertKeys[x]]}</em>}</button>)}
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
          <button className="fullscreen-button" onClick={toggleFullscreen}>⛶ Full screen</button>
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
            <button className="notification-bell" onClick={()=>setAlertsOpen(x=>!x)} aria-label="Open notifications">♢{Number(notifications.Total||0)>0&&<em>{notifications.Total}</em>}</button>
            {alertsOpen&&<div className="notification-panel"><h3>Needs attention · {notifications.Total||0}</h3>{Number(notifications.Approvals||0)>0&&<button onClick={()=>{setView("Bills");setAlertsOpen(false)}}><b>{notifications.Approvals} approval requests</b><small>{notifications.Details?.approvals?.slice(0,2).map((x:any)=>x.label).join(" · ")||"Held-bill changes need review"}</small></button>}{Number(notifications.Bills||0)>0&&<button onClick={()=>{setView("Bills");setAlertsOpen(false)}}><b>{notifications.Bills} unresolved bills</b><small>{notifications.Details?.bills?.slice(0,3).map((x:any)=>`${x.label} ${x.status}`).join(" · ")}</small></button>}{Number(notifications.Inventory||0)>0&&<button onClick={()=>{setView("Inventory");setAlertsOpen(false)}}><b>{notifications.Inventory} stock alerts</b><small>{notifications.Details?.inventory?.slice(0,3).map((x:any)=>x.label).join(" · ")}</small></button>}{Number(notifications.Expenses||0)>0&&<button onClick={()=>{setView("Expense");setAlertsOpen(false)}}><b>{notifications.Expenses} unpaid expenses</b><small>{notifications.Details?.expenses?.slice(0,3).map((x:any)=>x.label).join(" · ")}</small></button>}{Number(notifications.Total||0)===0&&<p className="notification-empty">All caught up. No unresolved issues.</p>}</div>}
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
                      .filter((x) => x.active && x.sellable)
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
                        ? visibleProducts.filter((p) => p.active && p.sellable).length
                        : visibleProducts.filter(
                            (p) => p.active && p.sellable && p.category === x,
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
                  <button className={p.stock<=0?"out-of-stock":""} disabled={p.stock<=0} onClick={() => add(p)} key={p.id}>
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
                      {p.stock<=0&&<em className="stock-out-label">Out of stock</em>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="bill">
              <div className="bill-title">
                <span>
                  <small>CURRENT ORDER</small>
                  <h2>{activeBill ? `Order #${activeBill.dailyOrderNumber} · Rev ${activeBill.revision}` : "New order"}</h2>
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
                <button disabled={!activeBill} title={!activeBill?"Hold or print the unpaid bill first":undefined} onClick={() => checkout("Cash")}>▣ Post as Paid · Cash</button>
                <button disabled={!activeBill} title={!activeBill?"Hold or print the unpaid bill first":undefined} onClick={() => checkout("M-Pesa")}>▤ Post as Paid · M-Pesa</button>
                <button disabled={!activeBill} title={!activeBill?"Hold or print the unpaid bill first":undefined} className="credit" onClick={() => checkout("Credit")}>
                  ◴ Post as Credit
                </button>
              </div>
              <div className="bill-actions">
                <button onClick={()=>ensureHeld(false)}>▧ Hold bill</button>
                <button
                  onClick={() => ensureHeld(true)}
                >
                  ▤ Print Unpaid Bill
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
            navigate={setView}
          />
        )}{" "}
      </main>
      {message && (
        <div className={`toast ${messageIsError?"error":"success"}`} role="status" onClick={() => setMessage("")}>
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
            <button className="print" onClick={async()=>{try{await printReceiptText(receipt);setReceipt(undefined);setMessage(`${receiptKind} bill sent to the configured printer`)}catch(e){setMessage(e instanceof Error?e.message:"Receipt printing failed")}}}>
              Print {receiptKind} Bill
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
      const signedIn=await login(staffId,pin);await bootstrap();onLogin(signedIn);
    } catch {
      setError("Unable to sign in. Check the PIN and server connection.");
    }
  }
  return (
    <div className="login">
      <form onSubmit={submit}>
        <img className="login-lockup" src="/dukora-full-logo.png" alt="Dukora — Smarter Business Operations" />
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
        <div className="login-signoff"><span>Built by</span><b>Beyond Raw Data</b></div>
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
