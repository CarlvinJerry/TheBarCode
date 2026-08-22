import { db, saveBootstrap, type LocalSale } from './db';
const configuredBase=()=>localStorage.getItem('api_url')?.replace(/\/$/,'')||import.meta.env.VITE_API_URL||'/api';
export const session={get token(){return localStorage.getItem('barcode_token')??''},get user(){try{return JSON.parse(localStorage.getItem('barcode_user')??'null')}catch{return null}},set(token:string,user:unknown){localStorage.setItem('barcode_token',token);localStorage.setItem('barcode_user',JSON.stringify(user))},clear(){localStorage.removeItem('barcode_token');localStorage.removeItem('barcode_user')}};
async function request(path:string,init?:RequestInit){const response=await fetch(configuredBase()+path,{...init,headers:{'Content-Type':'application/json',...(session.token?{Authorization:`Bearer ${session.token}`}:{}) ,...init?.headers}});if(!response.ok)throw new Error(`${response.status} ${await response.text()}`);return response.json();}
export async function bootstrap(){const data=await request('/bootstrap');await saveBootstrap(data);return data;}
export async function login(staffId:string,pin:string){const result=await request('/auth/login',{method:'POST',body:JSON.stringify({staffId,pin})});session.set(result.token,result.user);return result.user;}
export async function syncOutbox(){if(!navigator.onLine||!session.token)return 0;const rows=await db.outbox.toArray();let synced=0;for(const row of rows){try{if(row.type==='sale')await request('/sales/sync',{method:'POST',body:JSON.stringify({...row.payload,items:row.payload.items.map((x:any)=>({productId:x.productId,quantity:x.quantity,unitPrice:x.unitPrice,discount:x.discount}))})});if(row.type==='customer')await request('/customers',{method:'POST',body:JSON.stringify(row.payload)});if(row.type==='stock')await request('/stock-movements',{method:'POST',body:JSON.stringify(row.payload)});await db.outbox.delete(row.id!);if(row.type==='sale')await db.sales.update(row.payload.deviceTransactionId,{synced:true});synced++;}catch(error){await db.outbox.update(row.id!,{attempts:row.attempts+1,lastError:String(error)})}}return synced;}
export async function createProduct(product:Record<string,unknown>){return request('/products',{method:'POST',body:JSON.stringify(product)});}
export async function getSummary(from:string,to:string){return request(`/reports/summary?from=${from}&to=${to}`);}
export async function createExpense(expense:Record<string,unknown>){return request('/expenses',{method:'POST',body:JSON.stringify(expense)});}
export async function getAudit(){return request('/audit?take=200');}
export async function getStaff(){return request('/staff');}
export async function createStaff(staff:Record<string,unknown>){return request('/staff',{method:'POST',body:JSON.stringify(staff)});}
export async function resetDemo(){return request('/demo/reset',{method:'POST'});}
export async function removeDemo(){return request('/demo',{method:'DELETE'});}
export async function getCustomerSummary(){return request('/customers/summary');}
export async function getDailyReport(from:string,to:string){return request(`/reports/daily?from=${from}&to=${to}`);}
export type { LocalSale };
