import Dexie, { type EntityTable } from 'dexie';
export type Product={id:string;name:string;category:string;barcode?:string;unit:string;costPrice:number;sellingPrice:number;stock:number;minStock:number;sellable:boolean;active:boolean};
export type Customer={id:string;name:string;phone?:string;creditLimit:number;notes?:string};
export type Staff={id:string;name:string;role:string};
export type SaleLine={productId:string;productName:string;quantity:number;unitPrice:number;unitCost:number;discount:number};
export type LocalSale={deviceTransactionId:string;customerId?:string;staffId:string;status:string;discount:number;occurredAt:string;deviceId:string;items:SaleLine[];payments:{method:string;amount:number}[];total:number;synced:boolean};
export type Outbox={id?:number;type:'sale';payload:LocalSale;createdAt:string;attempts:number;lastError?:string};
class BarcodeDb extends Dexie{products!:EntityTable<Product,'id'>;customers!:EntityTable<Customer,'id'>;staff!:EntityTable<Staff,'id'>;sales!:EntityTable<LocalSale,'deviceTransactionId'>;outbox!:EntityTable<Outbox,'id'>;constructor(){super('thebarcode-pos');this.version(1).stores({products:'id,category,barcode,active',customers:'id,name,phone',staff:'id,name,role',sales:'deviceTransactionId,occurredAt,status,synced',outbox:'++id,type,createdAt'});}}
export const db=new BarcodeDb();
export async function saveBootstrap(data:{products:Product[];customers:Customer[];staff:Staff[]}){await db.transaction('rw',db.products,db.customers,db.staff,async()=>{await db.products.bulkPut(data.products);await db.customers.bulkPut(data.customers);await db.staff.bulkPut(data.staff)});}
export async function queueSale(sale:LocalSale){await db.transaction('rw',db.sales,db.products,db.outbox,async()=>{await db.sales.put(sale);for(const line of sale.items){const product=await db.products.get(line.productId);if(product)await db.products.update(product.id,{stock:product.stock-line.quantity});}await db.outbox.add({type:'sale',payload:sale,createdAt:new Date().toISOString(),attempts:0});});}
