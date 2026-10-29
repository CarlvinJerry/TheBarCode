export type SecurityActivity = { id:string; at:string; action:string; actor:string; detail?:string };
const KEY = "thebarcode_security_activity";

export function recordSecurityActivity(action:string, actor:string, detail?:string) {
  try {
    const existing = JSON.parse(localStorage.getItem(KEY) || "[]") as SecurityActivity[];
    const next = [{ id:crypto.randomUUID(), at:new Date().toISOString(), action, actor, detail }, ...existing].slice(0,100);
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.setItem("thebarcode_security_last_activity", next[0].at);
    dispatchEvent(new CustomEvent("thebarcode:security-activity"));
  } catch { /* Local security history must never block a sign-in or lock action. */ }
}

export function getSecurityActivity():SecurityActivity[] {
  try { return (JSON.parse(localStorage.getItem(KEY) || "[]") as SecurityActivity[]).slice(0,20); }
  catch { return []; }
}
