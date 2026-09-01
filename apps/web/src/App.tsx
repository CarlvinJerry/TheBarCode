import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { bootstrap, getBills, getLoginStaff, getNotifications, getSettings, holdBill, login, postBill, session, syncOutbox, updateBill } from "./api";
import {
  db,
  queueCustomer,
  queueSale,
  type Customer,
  type Product,
  type Staff,
} from "./db";
import { Management } from "./Management";
import { buildSaleReceipt, cachedOrganizationSettings, cachedReceiptSettings, printReceiptText } from "./receiptPrinter";
import { enabledModules, profileFor } from "./industryProfiles";
import { APP_VERSION } from "./version";
import "./App.css";

type CartLine = Product & { quantity: number };
const money = (n: number) => `KES ${n.toLocaleString()}`;
const iconPaths:Record<string,string>={Sell:"M3 5h18M5 5l1.5 15h11L19 5M9 9v7m6-7v7",Dashboard:"M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z",Bills:"M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h4",Inventory:"M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10",Customers:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 0 0 0-6m5 17v-2a4 4 0 0 0-3-3.87",Expense:"M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",Production:"M14.7 6.3a4 4 0 0 0-5-5L12 3.6 3.6 12l-2.3-.7a4 4 0 0 0 5 5L14.7 8l2.3.7a4 4 0 0 0 5-5L19.6 6l-8.3 8.3",Reports:"M4 20V10m6 10V4m6 16v-7m4 7H2",SmartInsights:"M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13Z",AuditTrail:"M4 5h16M4 12h16M4 19h10",StaffRoles:"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6m3-3h-6",ItemSetup:"M12 5v14m-7-7h14",Settings:"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3.5h-4L10.6 6a8 8 0 0 0-1.7 1L6.5 6 4.5 9.4l2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.5h4l.4-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z",Bell:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4",Chevron:"M9 18l6-6-6-6",Menu:"M4 7h16M4 12h16M4 17h16",Logout:"M10 17l5-5-5-5m5 5H3m12-9h5v18h-5",Fullscreen:"M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"};
function Icon({name,size=18}:{name:string;size?:number}){const key=name.replaceAll(" ","").replace("Expenses","Expense");const path=key==="Accounting"?"M4 19h16M6 16V8m6 8V4m6 12v-6":iconPaths[key]||iconPaths.ItemSetup;return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>}
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
    [lastHeldBill,setLastHeldBill]=useState<any>(),
    [draftTransactionId,setDraftTransactionId]=useState(()=>crypto.randomUUID()),
    [orderFailure,setOrderFailure]=useState(""),
    [notifications, setNotifications] = useState<Record<string, any>>({Total:0,Details:{}}),
    [seenNotificationFingerprint,setSeenNotificationFingerprint]=useState(localStorage.getItem("notification_seen")||""),
    [alertsOpen,setAlertsOpen]=useState(false),
    [navigationLayout,setNavigationLayout]=useState(localStorage.getItem("navigation_layout")||"Vertical"),
    [organizationProfile,setOrganizationProfile]=useState(cachedOrganizationSettings()),
    [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({Operations:false,"Data & Setup":false}),
    [collapsed, setCollapsed] = useState(
      localStorage.getItem("sidebar_collapsed") === "true",
    );
  const notificationRequest=useRef(0);
  const notificationFingerprint=JSON.stringify(Object.values(notifications.Details||{}).flat().map((x:any)=>[x.id,x.status,x.stock,x.minStock,x.balance,x.total]));
  const notificationsSeen=Boolean(notificationFingerprint)&&seenNotificationFingerprint===notificationFingerprint;
  const attention=notifications;
  useEffect(() => {
    document.documentElement.dataset.theme = (
      localStorage.getItem("theme") || "Forest"
    ).toLowerCase();
    (user?bootstrap():getLoginStaff()).catch(() => setMessage("Offline mode · using saved sign-in data"));
    const change = () => setOnline(navigator.onLine);
    addEventListener("online", change);
    addEventListener("offline", change);
    const navigationChanged=(event:Event)=>setNavigationLayout((event as CustomEvent<string>).detail);const industryChanged=(event:Event)=>{const next=(event as CustomEvent<any>).detail;setOrganizationProfile(next);const modules=enabledModules(next.enabledModules);setView(current=>(current==="Production"&&!modules.has("production"))||(current==="Reports"&&!modules.has("reports"))||(current==="Smart Insights"&&!modules.has("ai"))?"Dashboard":current)};addEventListener("dukora:navigation-layout",navigationChanged);addEventListener("dukora:industry-profile",industryChanged);
    let refreshTimer=0;const dataChanged=()=>{clearTimeout(refreshTimer);refreshTimer=window.setTimeout(()=>bootstrap().catch(()=>0),80)};addEventListener("thebarcode:data-changed",dataChanged);
    const timer = setInterval(() => syncOutbox().catch(() => 0), 15000);
    return () => {
      removeEventListener("online", change);
      removeEventListener("offline", change);
      removeEventListener("dukora:navigation-layout",navigationChanged);
      removeEventListener("dukora:industry-profile",industryChanged);
      removeEventListener("thebarcode:data-changed",dataChanged);clearTimeout(refreshTimer);
      clearInterval(timer);
    };
  }, []);
  useEffect(()=>{if(!user)return;void getSettings().then(settings=>{if(!settings?.organization)return;setOrganizationProfile(settings.organization);localStorage.setItem("organization_profile",JSON.stringify(settings.organization))}).catch(()=>0)},[user?.id]);
  useEffect(()=>{if(!user)return;const refresh=async()=>{const request=++notificationRequest.current;try{const current=await getNotifications();if(request===notificationRequest.current)setNotifications(current)}catch{}};const attention=()=>void refresh();const visible=()=>{if(document.visibilityState==="visible")void refresh()};addEventListener("dukora:attention",attention);addEventListener("focus",attention);document.addEventListener("visibilitychange",visible);void refresh();const timer=setInterval(refresh,10000);return()=>{removeEventListener("dukora:attention",attention);removeEventListener("focus",attention);document.removeEventListener("visibilitychange",visible);clearInterval(timer)}},[user?.id]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(""),5000);return()=>clearTimeout(timer)},[message]);
  useEffect(()=>{if(seenNotificationFingerprint)localStorage.setItem("notification_seen",seenNotificationFingerprint)},[seenNotificationFingerprint]);
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
  const add = (p: Product) => setCart((c) => {const current=c.find(x=>x.id===p.id)?.quantity||0;if(current>=p.stock){setMessage(`${p.name} is limited to ${p.stock} available unit${p.stock===1?"":"s"}`);return c}return c.some(x=>x.id===p.id)?c.map(x=>x.id===p.id?{...x,quantity:Math.min(p.stock,x.quantity+1)}:x):[...c,{...p,quantity:1}]});
  const qty = (id: string, d: number) =>
    setCart((c) =>
      c
        .map((x) => (x.id === id ? { ...x, quantity: Math.max(0,Math.min(x.stock,x.quantity + d)) } : x))
        .filter((x) => x.quantity > 0),
    );
  const billPayload=()=>({deviceTransactionId:activeBill?.deviceTransactionId||draftTransactionId,customerId:selectedCustomer?.id,staffId:user.id,discount:0,notes:"POS order",deviceId:localStorage.getItem("device_id")??"windows-pos-01",items:cart.map(x=>({productId:x.id,quantity:x.quantity,unitPrice:x.sellingPrice,discount:0}))});
  async function ensureHeld(openPrint=false){
    if(!cart.length)return;
    try{
      const saved=activeBill?await updateBill(activeBill.id,{...billPayload(),reason:"Updated from active POS order",expectedRevision:activeBill.revision}):await holdBill(billPayload());setActiveBill(saved);setOrderFailure("");dispatchEvent(new Event("dukora:attention"));
      const unpaid=buildSaleReceipt({id:String(saved.receiptNumber||saved.deviceTransactionId),dailyOrderNumber:saved.dailyOrderNumber,walkInNumber:saved.walkInNumber,customerName:selectedCustomer?.name||"Walk-in customer",cashierName:user.name,method:"Unpaid",status:"UNPAID",credit:true,items:cart.map(x=>({name:x.name,quantity:x.quantity,unitPrice:x.sellingPrice})),total});
      if(openPrint){setReceiptKind("Unpaid");setReceipt(`${unpaid}\nREVISION: ${saved.revision||1}`)}
      setMessage(`Bill #${saved.receiptNumber} is held and awaiting payment or credit${openPrint?" · confirm Print Unpaid Bill":""}`);return saved;
    }catch(error){const reason=error instanceof Error?`Could not hold bill: ${error.message}`:"Could not hold bill on the shared server";setOrderFailure(reason);setMessage(reason);}
  }
  function clearForNextOrder(saved?:any){if(saved)setLastHeldBill(saved);setCart([]);setSelectedCustomer(undefined);setActiveBill(undefined);setDraftTransactionId(crypto.randomUUID());setOrderFailure("");setQuery("");setCategory("All")}
  function startNextOrder(saved:any){clearForNextOrder(saved);setMessage(`Unpaid bill #${saved.receiptNumber} was printed and held. New entries now create a separate bill.`);dispatchEvent(new Event("dukora:attention"));bootstrap().catch(()=>0)}
  async function openRecoverableBill(){try{const match=activeBill||(await getBills("All")).find((x:any)=>x.deviceTransactionId===draftTransactionId);if(!match){setMessage("No saved held bill was found for this order. Retry it or start a new order.");return}setActiveBill(match);localStorage.setItem("bill_focus",match.id);setView("Bills");setOrderFailure("")}catch(error){setMessage(error instanceof Error?error.message:"Could not verify the held bill")}}
  async function forceNewOrder(){let saved=activeBill;try{saved=saved||(await getBills("All")).find((x:any)=>x.deviceTransactionId===draftTransactionId)}catch{}clearForNextOrder(saved);setMessage(saved?`Bill #${saved.receiptNumber} remains held under Bills. A clean new order is ready.`:"The failed draft was detached. A clean new order is ready; verify Bills when the server reconnects.");dispatchEvent(new Event("dukora:attention"))}
  async function reloadHeldOrder(){if(!activeBill)return;try{const match=(await getBills("All")).find((x:any)=>x.id===activeBill.id);if(!match||match.status!=="Held"){setMessage("This bill is no longer held. Open Bills to review its current status.");return}const restored=match.items.map((line:any)=>{const product=visibleProducts.find(x=>x.id===line.productId);return product?{...product,quantity:Number(line.quantity),sellingPrice:Number(line.unitPrice)}:null}).filter(Boolean) as CartLine[];if(restored.length!==match.items.length){setMessage("This held bill contains an unavailable item and cannot be restarted on Sell.");return}setActiveBill(match);setDraftTransactionId(match.deviceTransactionId);setCart(restored);setSelectedCustomer(customers.find(x=>x.id===match.customerId));setOrderFailure("");setMessage(`Bill #${match.receiptNumber} reloaded at revision ${match.revision}`)}catch(error){const reason=error instanceof Error?error.message:"Could not reload the held bill";setOrderFailure(reason);setMessage(reason)}}
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
    const id = draftTransactionId, credit = method === "Credit",
      customerName = selectedCustomer?.name || "Walk-in customer";
    try{
      const held=await updateBill(activeBill.id,{...billPayload(),reason:"Final POS revision before posting",expectedRevision:activeBill.revision});
      const dueAt=credit?new Date(Date.now()+7*86400000).toISOString():undefined;
      const posted=await postBill(held.id,{status:credit?"Credit":"Paid",method,amountPaid:credit?0:total,dueAt,notes:credit?"Credit approved at POS":"Paid at POS",deviceId:localStorage.getItem("device_id")??"windows-pos-01"});
      const receiptText=buildSaleReceipt({id:String(posted.receiptNumber||id),dailyOrderNumber:posted.dailyOrderNumber,walkInNumber:posted.walkInNumber,customerName,cashierName:user.name,method,status:credit?"CREDIT":"PAID",credit,items:cart.map(x=>({name:x.name,quantity:x.quantity,unitPrice:x.sellingPrice})),total});
      const receiptConfig=cachedReceiptSettings();setReceiptKind(credit?"Credit":"Paid");setReceipt(receiptText);if((!credit&&receiptConfig.autoPrintPaidSale)||(credit&&receiptConfig.creditSalePrintMode==="Automatic"))for(let copy=0;copy<receiptConfig.copies;copy++)await printReceiptText(receiptText);
      clearForNextOrder();setMessage(credit?"Credit invoice posted and added to follow-up":"Sale, payment and stock posted together");dispatchEvent(new Event("dukora:attention"));bootstrap().catch(()=>0);return;
    }catch(error){const reason=error instanceof Error?error.message:"Sale could not be posted";setOrderFailure(reason);setMessage(reason);if(navigator.onLine||activeBill)return;}
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
    clearForNextOrder();
    setMessage("Sale saved safely on this device");
    syncOutbox().catch(() => 0);
  }
  const primaryViews=["Sell","Dashboard","Bills","Inventory"];
  const institutionModules=enabledModules(organizationProfile.enabledModules),industry=profileFor(organizationProfile.industryProfile);
  const menuGroups={Operations:["Expense",...(institutionModules.has("accounting")?["Accounting"]:[]),...(institutionModules.has("production")?["Production"]:[]),...(institutionModules.has("reports")?["Reports"]:[]),"Audit trail"],"Data & Setup":["Customers","Staff & Roles","Item Setup"]};
  const alertKeys:Record<string,string>={Bills:"Bills",Inventory:"Inventory",Customers:"Customers",Expenses:"Expenses",Expense:"Expenses","Audit trail":"AuditTrail",Settings:"Settings"};
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(new Date())
    .toUpperCase();
  const pageTitle = view === "Sell" ? "New sale" : view==="Production"?industry.productionLabel:view;
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
          <img className="brand-lockup" src="/thebarcode-logo-light-text.png" alt="TheBarcode" />
          <img className="brand-logo" src="/thebarcode-logo-light-text.png" alt="TheBarcode" />
          <button
            className="collapse-sidebar"
            onClick={toggleSidebar}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            <Icon name="Menu" />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {primaryViews.map((x) => (
            <button
              className={view === x ? "active" : ""}
              onClick={() => setView(x)}
              key={x}
            >
              <i><Icon name={x}/></i>
              <span>{x}</span>{(attention[alertKeys[x]]||0)>0&&<em className="menu-alert" title={`${attention[alertKeys[x]]} items need attention`}>{attention[alertKeys[x]]}</em>}
            </button>
          ))}
          {Object.entries(menuGroups).map(([group,items])=><div className="nav-group" key={group}><button className="nav-group-toggle" aria-expanded={expandedGroups[group]} onClick={()=>setExpandedGroups(x=>({...x,[group]:!x[group]}))}><i className={expandedGroups[group]?"chevron open":"chevron"}><Icon name="Chevron" size={14}/></i><span>{group}</span>{items.reduce((sum,x)=>sum+(attention[alertKeys[x]]||0),0)>0&&<em className="menu-alert">{items.reduce((sum,x)=>sum+(attention[alertKeys[x]]||0),0)}</em>}</button>{expandedGroups[group]&&<div className="nav-submenu">{items.map(x=><button className={view===x?"active":""} onClick={()=>setView(x)} key={x}><i><Icon name={x}/></i><span>{x}</span>{(attention[alertKeys[x]]||0)>0&&<em className="menu-alert">{attention[alertKeys[x]]}</em>}</button>)}</div>}</div>)}
          {[...(institutionModules.has("ai")?["Smart Insights"]:[]),"Settings"].map(x=><button className={view===x?"active":""} onClick={()=>setView(x)} key={x}><i><Icon name={x}/></i><span>{x}</span>{(attention[alertKeys[x]]||0)>0&&<em className="menu-alert">{attention[alertKeys[x]]}</em>}</button>)}
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
            <Icon name="Logout" size={14}/> <b>Sign out</b>
          </button>
        </div>
        <button className="fullscreen-button" onClick={toggleFullscreen}><Icon name="Fullscreen" size={13}/> Full screen</button>
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
            <button className="notification-bell" aria-expanded={alertsOpen} onClick={()=>setAlertsOpen(open=>{if(!open&&notificationFingerprint)setSeenNotificationFingerprint(notificationFingerprint);return !open})} aria-label="Open notifications"><Icon name="Bell" size={18}/>{!notificationsSeen&&Number(notifications.Total||0)>0&&<em>{notifications.Total}</em>}</button>
            {alertsOpen&&<div className="notification-panel" role="dialog" aria-label="Active notifications"><div className="notification-heading"><span><small>NOTIFICATIONS</small><h3>Active conditions</h3></span><b>{notifications.Total||0}</b></div>{Number(notifications.Total||0)>0&&<p className="notification-guidance">Opening clears the bell badge. Unresolved work stays visible here and on its menu until the underlying record is addressed.</p>}{Number(notifications.Approvals||0)>0&&<button onClick={()=>{setView("Bills");setAlertsOpen(false)}}><b>{notifications.Approvals} approval requests</b><small>{notifications.Details?.approvals?.slice(0,2).map((x:any)=>x.label).join(" · ")||"Held-bill changes need review"}</small><i>Review →</i></button>}{Number(notifications.Bills||0)>0&&<button onClick={()=>{setView("Bills");setAlertsOpen(false)}}><b>{notifications.Bills} unresolved bills</b><small>{notifications.Details?.bills?.slice(0,3).map((x:any)=>`${x.label} ${x.status}`).join(" · ")}</small><i>Open bills →</i></button>}{Number(notifications.Inventory||0)>0&&<button onClick={()=>{setView("Inventory");setAlertsOpen(false)}}><b>{notifications.Inventory} stock alerts</b><small>{notifications.Details?.inventory?.slice(0,3).map((x:any)=>x.label).join(" · ")}</small><i>Review stock →</i></button>}{Number(notifications.Expenses||0)>0&&<button onClick={()=>{setView("Expense");setAlertsOpen(false)}}><b>{notifications.Expenses} unpaid expenses</b><small>{notifications.Details?.expenses?.slice(0,3).map((x:any)=>x.label).join(" · ")}</small><i>Open expenses →</i></button>}{Number(notifications.Total||0)===0&&<p className="notification-empty">All caught up. No unresolved issues.</p>}</div>}
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
              {filtered.length===0&&<div className="catalogue-empty"><span>□</span><h3>{query||category!=="All"?"No matching sellable items":"Your sell catalogue is empty"}</h3><p>{query||category!=="All"?"Try another search or category. Archived and out-of-stock items remain managed in Item Setup.":"Add sellable items and opening stock before recording the first sale."}</p><button onClick={()=>{setQuery("");setCategory("All");setExpandedGroups(x=>({...x,"Data & Setup":true}));setView("Item Setup")}}>Open Item Setup</button></div>}
            </section>
            <section className="bill">
              <div className="bill-title">
                <span>
                  <small>CURRENT ORDER</small>
                  <h2>{activeBill ? `Order #${activeBill.dailyOrderNumber} · Rev ${activeBill.revision}` : "New order"}</h2>
                </span>
                <button onClick={() => {if(activeBill){setOrderFailure("This order is already held. Detach it safely before starting another order.");setMessage("Held bills are preserved. Use Start new order below to continue without deleting it.")}else{clearForNextOrder();setMessage("Unsaved draft cleared. A clean new order is ready.")}}}>⌫</button>
              </div>
              {lastHeldBill&&!activeBill&&<div className="next-order-notice"><span><b>New order ready</b><small>Printed bill #{lastHeldBill.receiptNumber} is held. New entries create a separate bill number.</small></span><button onClick={()=>{localStorage.setItem("bill_focus",lastHeldBill.id);setView("Bills")}}>Update held bill</button></div>}
              {activeBill&&<div className="held-order-controls"><b>Held bill #{activeBill.receiptNumber}</b><small>You can leave this bill held and continue with a different customer without printing it.</small><div><button onClick={reloadHeldOrder}>Reload held bill</button><button onClick={openRecoverableBill}>Open in Bills</button><button className="held-new-order" onClick={forceNewOrder}>Keep held & start new</button></div></div>}
              {orderFailure&&<div className="order-recovery"><b>Current order needs attention</b><small>{orderFailure}</small><p>This order has not been deleted. Retry it, open the matching held bill, or detach it and start a clean order.</p><div><button onClick={()=>ensureHeld(false)}>Retry current order</button><button onClick={openRecoverableBill}>Open held bill</button><button className="recovery-new" onClick={forceNewOrder}>Start new order</button></div></div>}
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
            <button className="print" onClick={async()=>{try{await printReceiptText(receipt);setReceipt(undefined);if(receiptKind==="Unpaid"&&activeBill)startNextOrder(activeBill);else setMessage(`${receiptKind} bill sent to the configured printer`)}catch(e){setMessage(e instanceof Error?e.message:"Receipt printing failed")}}}>
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
        <img className="login-lockup" src="/thebarcode-logo-dark-text.png" alt="TheBarcode" />
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
