function addDemoProjectDetails(state){
  for(const [id,client,address,contact,start,end]of [
    ['o1','Maria Oliveira','Rua da Demonstração, 10 · morada fictícia','António Ferreira','2026-10-01','2026-10-16'],
    ['o2','Carlos Pereira','Travessa de Exemplo, 25 · morada fictícia','Miguel Santos','2026-10-12','2026-10-30'],
    ['o3','Ana Rodrigues','Rua de Teste, 8 · morada fictícia','Rui Almeida','2026-10-14','2026-11-06']
  ]){
    const p=state.projects.find(p=>p.id===id&&p.client===client);if(!p)throw Error('Base diferente da demonstração original.');
    // Existing values, including deliberately cleared values, are never replaced.
    p.address??=address;p.siteContact??=contact;p.plannedStart??=start;p.plannedEnd??=end;
  }
}
module.exports={addDemoProjectDetails};
