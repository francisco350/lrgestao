// Shared fictitious examples for a new database or the opt-in demo initializer.
const {apply}=require('./lib/costs.cjs');
function addDemoCosts(state,user,helpers){
  const examples=[
    {project:'o1',kind:'material',description:'Cimento para regularização (fictício)',quantity:12,unit:'saco',unitPrice:6.45,date:'2026-10-13',supplier:'Materiais da Maia · fictício',reference:'DEMO-MAT-001'},
    {project:'o1',kind:'expense',category:'Resíduos',description:'Recolha de entulho (fictício)',unitPrice:150,date:'2026-10-14',supplier:'Transportes Norte · fictício',reference:'DEMO-DESP-001'},
    {project:'o2',kind:'material',description:'Revestimento cerâmico (fictício)',quantity:18.5,unit:'m²',unitPrice:22.9,date:'2026-10-15',supplier:'Cerâmicas Porto · fictício',reference:'DEMO-MAT-002'},
    {project:'o3',kind:'expense',category:'Aluguer de equipamento',description:'Aluguer de andaime (fictício)',unitPrice:85,date:'2026-10-16',supplier:'Equipamentos Norte · fictício',reference:'DEMO-DESP-002'}
  ];
  for(const row of examples)apply(state,user,'cost',row,helpers);
}
module.exports={addDemoCosts};
