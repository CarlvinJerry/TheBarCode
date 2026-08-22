import fs from "node:fs";
import path from "node:path";
import jspdf from "../apps/web/node_modules/jspdf/dist/jspdf.node.min.js";
import autoTable from "../apps/web/node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.mjs";

const {jsPDF}=jspdf;

const root=path.resolve(import.meta.dirname,"..");
const output=path.join(root,"output","pdf","Dukora-report-sample.pdf");
fs.mkdirSync(path.dirname(output),{recursive:true});
const doc=new jsPDF({unit:"mm",format:"a4"}),green=[21,61,52],orange=[255,117,66],fmt=n=>`KES ${n.toLocaleString()}`;
const revenue=486250,cost=301475,expenses=58700,gross=revenue-cost,net=gross-expenses,margin=gross/revenue*100;
doc.setFillColor(...green);doc.rect(0,0,210,34,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(19);doc.text("Dukora Demo Café",14,14);doc.setFontSize(11);doc.text("Management summary",14,22);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text("2026-08-01 to 2026-08-22 | Sample generated for layout verification",14,28);doc.setTextColor(24,38,33);
[["Revenue",fmt(revenue)],["Gross profit",fmt(gross)],["Net profit",fmt(net)],["Margin",`${margin.toFixed(1)}%`]].forEach((c,i)=>{const x=14+i*47;doc.setFillColor(244,248,246);doc.roundedRect(x,40,43,23,2,2,"F");doc.setFontSize(7);doc.setTextColor(100,115,108);doc.text(c[0],x+4,47);doc.setFontSize(11);doc.setFont("helvetica","bold");doc.setTextColor(24,55,46);doc.text(c[1],x+4,56,{maxWidth:36});doc.setFont("helvetica","normal")});
doc.setFontSize(11);doc.setFont("helvetica","bold");doc.text("Daily revenue and gross profit",14,73);const daily=[31,44,37,52,40,56,49,62,45,51,66,59,72,68].map((v,i)=>({v:v*1000,p:v*380})),max=Math.max(...daily.map(x=>x.v));daily.forEach((x,i)=>{const bx=15+i*12.8,rh=28*x.v/max,ph=28*x.p/max;doc.setFillColor(...green);doc.rect(bx,105-rh,5.2,rh,"F");doc.setFillColor(...orange);doc.rect(bx+5.2,105-ph,5.2,ph,"F");doc.setFontSize(5.5);doc.setTextColor(95);doc.text(`Aug ${i+9}`,bx,110,{angle:35})});doc.setFontSize(7);doc.setTextColor(...green);doc.text("Revenue",156,73);doc.setTextColor(...orange);doc.text("Gross profit",177,73);
autoTable(doc,{startY:119,head:[["Profit and loss","Amount"]],body:[["Posted sales revenue",fmt(revenue)],["Cost of goods sold",fmt(cost)],["Gross profit",fmt(gross)],["Operating expenses",fmt(expenses)],["Net profit",fmt(net)]],theme:"grid",headStyles:{fillColor:green},styles:{fontSize:8}});
autoTable(doc,{startY:doc.lastAutoTable.finalY+7,head:[["Top seller","Qty","Revenue","Profit"]],body:[["Cappuccino","284",fmt(99400),fmt(36920)],["Chocolate cake slice","146",fmt(80300),fmt(32120)],["Tusker Lager","192",fmt(61440),fmt(17280)],["Beef burger","88",fmt(52800),fmt(18480)]],theme:"striped",headStyles:{fillColor:green},styles:{fontSize:7.5}});
doc.addPage();doc.setFillColor(...green);doc.rect(0,0,210,18,"F");doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(13);doc.text("Operations detail",14,12);doc.setTextColor(25);doc.setFont("helvetica","normal");
autoTable(doc,{startY:25,head:[["Payment method","Collected"]],body:[["M-Pesa",fmt(255800)],["Cash",fmt(181950)],["Card",fmt(48500)]],theme:"grid",headStyles:{fillColor:green},styles:{fontSize:8}});
autoTable(doc,{startY:doc.lastAutoTable.finalY+7,head:[["Low stock item","Category","Stock","Minimum","Sell price"]],body:[["Whole milk","4","4","12",fmt(180)],["Tusker Lager","8","8","24",fmt(320)],["Chocolate cake","3","3","8",fmt(550)]],theme:"striped",headStyles:{fillColor:orange},styles:{fontSize:7.5}});
autoTable(doc,{startY:doc.lastAutoTable.finalY+7,head:[["Expense","Category","Amount","Paid","Method"]],body:[["Electricity","Utilities",fmt(18400),fmt(18400),"Bank"],["Fresh produce","Supplies",fmt(12600),fmt(12600),"M-Pesa"],["Equipment service","Maintenance",fmt(8500),fmt(8500),"Cash"]],theme:"grid",headStyles:{fillColor:green},styles:{fontSize:7}});
for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(110);doc.text(`Dukora - Dukora Demo Café - Page ${p} of ${doc.getNumberOfPages()}`,105,291,{align:"center"})}
fs.writeFileSync(output,Buffer.from(doc.output("arraybuffer")));
console.log(output);
