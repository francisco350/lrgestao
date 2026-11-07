const test=require('node:test'),assert=require('node:assert/strict'),M=require('./lib/model.cjs');
test('pagamento ligado ao trabalho limita valor, associa obra e permite anular',()=>{
 const row={id:'r',employee:'e',project:'o',status:'approved',date:'2026-01-01',minutes:480,unitRate:10,payBasis:'hour',dayHours:8};
 const db={employees:[{id:'e'}],entries:[row],wagePayments:[]};
 const data={employee:'e',entry:'r',amount:40,date:'2026-01-02',type:'payment',method:'Transferência'};
 const payment=M.payment(db,data);assert.equal(payment.project,'o');assert.equal(payment.paidMinutes,240);db.wagePayments.push(payment);
 assert.throws(()=>M.payment(db,{...data,amount:41}));
 assert.throws(()=>M.payment(db,{...data,entry:'missing'}));
 assert.throws(()=>M.payment(db,{...data,date:'2025-12-31'}));
 assert.throws(()=>M.payment(db,{...data,type:'advance'}));
 payment.voided=true;assert.equal(M.payment(db,{...data,amount:80}).paidMinutes,480);
 row.status='pending';assert.throws(()=>M.payment(db,data));
});
