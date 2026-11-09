'use strict';
function accountPage(){
  return heading(admin()?'Administração da empresa':'A minha conta','Consulte a sua empresa e mantenha os seus dados de acesso atualizados.')+'<div class="section-stack">'+
    panel('Empresa','Empresa associada à sua conta.',`<div class="profile-card"><p>Nome: <strong>${esc(current.company?.name||'—')}</strong></p>${admin()?btn('Alterar nome da empresa','company-profile')+btn('Secções dos colaboradores','company-sections')+`<p>Crie contas individuais e atribua funções à sua equipa em <a class="view-link" href="#utilizadores">Utilizadores e acessos →</a></p>`:''}</div>`)+
    (admin()?companyImportPanel():'')+
    panel('Os meus dados de acesso','Estas alterações aplicam-se apenas à sua conta.',`<div class="profile-card"><p>Nome: <strong>${esc(current.name)}</strong><br>Utilizador: <strong>${esc(current.username)}</strong><br>Perfil: <strong>${roleName[current.role]}</strong></p><div class="account-actions">${admin()?btn('Alterar utilizador','account-username'):''}${btn('Alterar palavra-passe','change-password',true)}</div></div>`)+'</div>';
}
function companyImportPanel(){
  return panel('Importar dados da empresa','Preencha o modelo com os clientes, funcionários, obras e respetivas equipas.<a class="view-link description-action" href="/app/modelo-importacao-empresa.xlsx" download>Descarregar modelo Excel</a>',
    `<div class="profile-card import-body"><p>Use um ficheiro por empresa, até 3 MB e 2 000 linhas. Reutilize os códigos nas importações seguintes. Códigos novos criam fichas distintas, mesmo com o mesmo nome.</p>
    <form id="company-import-form" class="form-stack"><label class="field">Ficheiro Excel<input type="file" name="workbook" accept=".xlsx" required></label>
    <button class="btn" type="submit">Validar ficheiro</button></form><div id="company-import-result" aria-live="polite"></div></div>`);
}
document.addEventListener('change',event=>{
  if(event.target.form?.id==='company-import-form')$('#company-import-result').replaceChildren();
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(form.id!=='company-import-form')return;
  event.preventDefault();
  const file=form.elements.workbook.files[0],result=$('#company-import-result'),button=form.querySelector('button');
  result.replaceChildren();
  const currentFile=()=>form.isConnected&&form.elements.workbook.files[0]===file;
  try{
    if(!file||file.size>3*1024*1024||!file.name.toLowerCase().endsWith('.xlsx'))throw Error('Selecione um ficheiro .xlsx até 3 MB.');
    button.disabled=true;
    result.textContent='A validar o ficheiro…';
    const content=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.onerror=()=>reject(Error('Não foi possível ler o ficheiro.'));
      reader.readAsDataURL(file);
    });
    const report=await api('company-import','POST',{mode:'preview',content});
    if(!currentFile())return;
    if(report.errorCount){
      result.innerHTML=`<p><strong>Linhas com erro: ${report.errorCount}.</strong> Corrija o ficheiro e volte a validá-lo.</p><ul>${report.errors.map(error=>`<li>${esc(error)}</li>`).join('')}</ul>${report.errorCount>report.errors.length?'<p>São apresentados os primeiros 30 erros.</p>':''}`;
      return;
    }
    const items=Object.entries(report.summary);
    result.innerHTML=`<h3>Pré-visualização · ${esc(current.company.name)}</h3><p>${esc(file.name)}</p><ul>${items.map(([label,item])=>`<li><strong>${esc(label)}</strong> · a criar: ${item.created} · já existentes: ${item.existing}${item.examples.length?`<br><small>${item.examples.map(esc).join(', ')}</small>`:''}</li>`).join('')}</ul>`;
    if(!items.some(([,item])=>item.created)){result.insertAdjacentHTML('beforeend','<p>Todas as linhas já existem nesta empresa.</p>');return;}
    const confirm=document.createElement('button');
    confirm.type='button';confirm.className='btn primary';confirm.textContent='Confirmar importação';
    result.append(confirm);
    confirm.onclick=async()=>{
      confirm.disabled=true;button.disabled=true;form.elements.workbook.disabled=true;
      try{
        await api('company-import','POST',{mode:'commit',content,revision:report.revision});
        result.textContent='Importação concluída.';
        await load();toast('Importação concluída.');
      }catch(error){result.textContent=error.message+' Volte a validar o ficheiro.';}
      finally{button.disabled=false;form.elements.workbook.disabled=false;}
    };
  }catch(error){if(currentFile())result.textContent=error.message;}
  finally{button.disabled=false;}
});
document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='company-sections'&&admin()){
    const optional=routes().filter(([id])=>['resumo','trabalho','obras','planeamento','horas','pagamentos','ausencias','conta'].includes(id));
    const labels=optional.map(([id,label])=>[id,({conta:'A minha conta',pagamentos:'Os meus pagamentos'})[id]||label]);
    modal('Secções dos colaboradores',checks('sections','Além de Picar o ponto, mostrar aos colaboradores desta empresa',labels,current.company.workerSections),async ()=>{
      const workerSections=['ponto',...new FormData($('#form')).getAll('sections')];
      await api('company','POST',{workerSections});await load();toast('Secções dos colaboradores atualizadas.');
    });
  }
  if(action==='company-profile'&&admin())modal('Alterar nome da empresa',input('name','Nome da empresa',current.company.name,'text','required maxlength="120"',true),async data=>{
    const result=await api('company','POST',data);current.company=result.company;await load();toast('Nome da empresa atualizado.');
  });
  if(action==='account-username'&&admin())modal('Alterar utilizador',input('username','Novo utilizador',current.username,'text','required minlength="3" maxlength="40" autocomplete="username"',true)+input('currentPassword','Palavra-passe atual','','password','required autocomplete="current-password"',true),async data=>{
    const result=await api('change-username','POST',data);current=result.user;csrf=result.csrf;await load();toast('Utilizador alterado. Use o novo nome no próximo início de sessão.');
  },'Escolha um utilizador único na aplicação. As outras sessões desta conta serão terminadas.');
});
