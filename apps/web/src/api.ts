import { db, saveBootstrap, saveLoginStaff, type LocalSale } from './db';
const configuredBase=()=>localStorage.getItem('api_url')?.replace(/\/$/,'')||import.meta.env.VITE_API_URL||'/api';
export const session={get token(){return localStorage.getItem('barcode_token')??''},get user(){try{return JSON.parse(localStorage.getItem('barcode_user')??'null')}catch{return null}},set(token:string,user:any){localStorage.setItem('barcode_token',token);localStorage.setItem('barcode_user',JSON.stringify(user));localStorage.setItem('dukora_demo_context',String(Boolean(user?.isDemo)))},clear(){localStorage.removeItem('barcode_token');localStorage.removeItem('barcode_user');localStorage.removeItem('dukora_demo_context')}};
async function request(path:string,init?:RequestInit){const response=await fetch(configuredBase()+path,{...init,headers:{'Content-Type':'application/json',...(session.token?{Authorization:`Bearer ${session.token}`}:{}) ,...init?.headers}});if(!response.ok){const raw=await response.text();let reason="";try{const body=JSON.parse(raw);reason=body.error||body.detail||body.title||""}catch{reason=raw}if(!reason)reason=response.status===403?"You do not have permission to perform this action with the current account.":response.status===401?"Your session expired. Sign in again.":`Request failed (${response.status}).`;throw new Error(reason)}const result=response.status===204?null:await response.json();const method=(init?.method||'GET').toUpperCase();if(method!=='GET'&&!path.startsWith('/auth/'))dispatchEvent(new CustomEvent('thebarcode:data-changed',{detail:{path,method,at:Date.now()}}));return result;}
export async function bootstrap(){const data=await request('/bootstrap');await saveBootstrap(data);return data;}
export async function getLoginStaff(){const staff=await request('/auth/staff');await saveLoginStaff(staff);return staff;}
export async function login(staffId:string,pin:string){const result=await request('/auth/login',{method:'POST',body:JSON.stringify({staffId,pin})});session.set(result.token,result.user);return result.user;}
export async function syncOutbox(){if(!navigator.onLine||!session.token)return 0;const demo=Boolean(session.user?.isDemo),rows=(await db.outbox.toArray()).filter(x=>Boolean(x.payload?.isDemo)===demo);let synced=0;for(const row of rows){try{if(row.type==='sale')await request('/sales/sync',{method:'POST',body:JSON.stringify({...row.payload,items:row.payload.items.map((x:any)=>({productId:x.productId,quantity:x.quantity,unitPrice:x.unitPrice,discount:x.discount}))})});if(row.type==='customer')await request('/customers',{method:'POST',body:JSON.stringify(row.payload)});if(row.type==='stock')await request('/stock-movements',{method:'POST',body:JSON.stringify(row.payload)});await db.outbox.delete(row.id!);if(row.type==='sale')await db.sales.update(row.payload.deviceTransactionId,{synced:true});synced++;}catch(error){await db.outbox.update(row.id!,{attempts:row.attempts+1,lastError:String(error)})}}return synced;}
export async function createProduct(product:Record<string,unknown>){return request('/products/single',{method:'POST',body:JSON.stringify(product)});}
export async function bulkImportProducts(value:Record<string,unknown>){return request('/products/bulk-import',{method:'POST',body:JSON.stringify(value)});}
export async function getProductImportBatches(){return request('/products/import-batches');}
export async function reverseProductImport(id:string){return request(`/products/import-batches/${id}/reverse`,{method:'POST'});}
export async function getSummary(from:string,to:string){return request(`/reports/accurate?from=${from}&to=${to}`);}
export async function createExpense(expense:Record<string,unknown>){return request('/expenses',{method:'POST',body:JSON.stringify(expense)});}
export async function getAudit(){return request('/audit/live?take=500');}
export async function getStaff(){return request('/staff');}
export async function createStaff(staff:Record<string,unknown>){return request('/staff',{method:'POST',body:JSON.stringify(staff)});}
export async function resetDemo(){return request('/demo/reset',{method:'POST'});}
export async function removeDemo(){return request('/demo',{method:'DELETE'});}
export async function getMaintenanceBackups(){return request('/maintenance/backups');}
export async function createMaintenanceBackup(){return request('/maintenance/backup',{method:'POST'});}
export async function purgeLiveData(confirmation:string,reason:string){return request('/maintenance/purge',{method:'POST',body:JSON.stringify({confirmation,reason})});}
export async function getCustomerSummary(){return request('/customers/summary');}
export async function getDailyReport(from:string,to:string){return request(`/reports/daily?from=${from}&to=${to}`);}
export async function getOperationalOverview(from:string,to:string){return request(`/operations/overview?from=${from}&to=${to}`);}
export async function getExpenses(from:string,to:string,category='All'){return request(`/expenses?from=${from}&to=${to}&category=${encodeURIComponent(category)}`);}
export async function getProductionExpenses(from:string,to:string,category='All',status='All'){return request(`/expenses/production?from=${from}&to=${to}&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`);}
export async function createProductionExpense(value:Record<string,unknown>){return request('/expenses/production',{method:'POST',body:JSON.stringify(value)});}
export async function payExpense(id:string,value:Record<string,unknown>){return request(`/expenses/${id}/payments`,{method:'POST',body:JSON.stringify(value)});}
export async function approveExpense(id:string){return request(`/expenses/${id}/approve`,{method:'POST'});}
export async function updateExpense(id:string,value:Record<string,unknown>){return request(`/expenses/${id}`,{method:'PUT',body:JSON.stringify(value)});}
export async function getInsights(from:string,to:string){return request(`/insights?from=${from}&to=${to}`);}
export async function getSettings(){return request('/settings');}
export async function saveOrganization(value:Record<string,unknown>){return request('/settings/organization',{method:'PUT',body:JSON.stringify(value)});}
export async function getIndustryCatalog(){return request('/settings/industry-catalog');}
export async function saveIndustryConfiguration(value:Record<string,unknown>){return request('/settings/industry',{method:'PUT',body:JSON.stringify(value)});}
export async function saveReceiptConfiguration(value:Record<string,unknown>){return request('/settings/receipt',{method:'PUT',body:JSON.stringify(value)});}
export async function saveBranch(value:Record<string,unknown>){return request('/settings/branches',{method:'PUT',body:JSON.stringify(value)});}
export async function saveTerminalConfiguration(value:Record<string,unknown>){return request('/settings/terminals',{method:'PUT',body:JSON.stringify(value)});}
export async function getBills(status='All'){return request(`/bills?status=${encodeURIComponent(status)}`);}
export async function holdBill(value:Record<string,unknown>){return request('/bills/hold',{method:'POST',body:JSON.stringify(value)});}
export async function updateBill(id:string,value:Record<string,unknown>){return request(`/bills/${id}`,{method:'PUT',body:JSON.stringify(value)});}
export async function requestBillApproval(id:string,value:Record<string,unknown>){return request(`/bills/${id}/approval-requests`,{method:'POST',body:JSON.stringify(value)});}
export async function getBillApprovals(){return request('/bill-approvals');}
export async function resolveBillApproval(id:string,value:Record<string,unknown>){return request(`/bill-approvals/${id}/resolve`,{method:'POST',body:JSON.stringify(value)});}
export async function postBill(id:string,value:Record<string,unknown>){return request(`/bills/${id}/post`,{method:'POST',body:JSON.stringify(value)});}
export async function payBill(id:string,value:Record<string,unknown>){return request(`/bills/${id}/payments`,{method:'POST',body:JSON.stringify(value)});}
export async function cancelBill(id:string,reason:string,deviceId?:string){return request(`/bills/${id}/cancel?reason=${encodeURIComponent(reason)}&deviceId=${encodeURIComponent(deviceId||'')}`,{method:'POST'});}
export async function refundBill(id:string,reason:string,deviceId?:string){return request(`/bills/${id}/refund?reason=${encodeURIComponent(reason)}&deviceId=${encodeURIComponent(deviceId||'')}`,{method:'POST'});}
export async function getNotifications(){const x=await request('/notifications');return {Total:x.total??x.Total??0,Sell:x.sell??x.Sell??0,Bills:x.bills??x.Bills??0,Customers:x.customers??x.Customers??0,Inventory:x.inventory??x.Inventory??0,Approvals:x.approvals??x.Approvals??0,Expenses:x.expenses??x.Expenses??0,AuditTrail:x.auditTrail??x.AuditTrail??0,Settings:x.settings??x.Settings??0,Details:x.details??x.Details??{}};}
export async function updateProduct(id:string,value:Record<string,unknown>){return request(`/products/${id}`,{method:'PUT',body:JSON.stringify(value)});}
export async function updateCustomer(id:string,value:Record<string,unknown>){return request(`/customers/${id}`,{method:'PUT',body:JSON.stringify(value)});}
export async function updateStaff(id:string,value:Record<string,unknown>){return request(`/staff/${id}`,{method:'PUT',body:JSON.stringify(value)});}
export async function getInsightsSettings(){return request('/settings/insights');}
export async function saveInsightsSettings(value:Record<string,unknown>){return request('/settings/insights',{method:'PUT',body:JSON.stringify(value)});}
export async function getModules(){return request('/modules');}
export async function getAccountingOverview(from:string,to:string){return request(`/accounting/overview?from=${from}&to=${to}`);}
export async function getAccountingAccounts(){return request('/accounting/accounts');}
export async function getAccountingTrialBalance(from:string,to:string){return request(`/accounting/trial-balance?from=${from}&to=${to}`);}
export async function getAccountingJournals(from:string,to:string){return request(`/accounting/journals?from=${from}&to=${to}`);}
export async function createAccountingAdjustment(value:Record<string,unknown>){return request('/accounting/adjustments',{method:'POST',body:JSON.stringify(value)});}
export async function getAccountingPeriods(){return request('/accounting/periods');}
export async function createAccountingPeriod(value:Record<string,unknown>){return request('/accounting/periods',{method:'POST',body:JSON.stringify(value)});}
export async function lockAccountingPeriod(id:string){return request(`/accounting/periods/${id}/lock`,{method:'PUT'});}
export async function getRecipes(){return request('/recipes');}
export async function createRecipe(value:Record<string,unknown>){return request('/recipes',{method:'POST',body:JSON.stringify(value)});}
export async function getProductionRuns(){return request('/production-runs');}
export async function createProductionRun(value:Record<string,unknown>){return request('/production-runs',{method:'POST',body:JSON.stringify(value)});}
export type { LocalSale };
