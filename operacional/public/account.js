'use strict';
function accountPage(){
  return heading(admin()?'Administração da empresa':'A minha conta','Consulte a sua empresa e mantenha os seus dados de acesso atualizados.')+
    panel('Empresa','Empresa associada à sua conta.',`<div class="profile-card"><p>Nome: <strong>${esc(current.company?.name||'—')}</strong></p>${admin()?btn('Alterar nome da empresa','company-profile')+`<p>Crie contas individuais e atribua funções à sua equipa em <a class="view-link" href="#utilizadores">Utilizadores e acessos →</a></p>`:''}</div>`)+
    panel('Os meus dados de acesso','Estas alterações aplicam-se apenas à sua conta.',`<div class="profile-card"><p>Nome: <strong>${esc(current.name)}</strong><br>Utilizador: <strong>${esc(current.username)}</strong><br>Perfil: <strong>${roleName[current.role]}</strong></p><div class="account-actions">${admin()?btn('Alterar utilizador','account-username'):''}${btn('Alterar palavra-passe','change-password',true)}</div></div>`).replace('class="panel"','class="panel activity-panel"');
}
document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='company-profile'&&admin())modal('Alterar nome da empresa',input('name','Nome da empresa',current.company.name,'text','required maxlength="120"',true),async data=>{
    const result=await api('company','POST',data);current.company=result.company;await load();toast('Nome da empresa atualizado.');
  });
  if(action==='account-username'&&admin())modal('Alterar utilizador',input('username','Novo utilizador',current.username,'text','required minlength="3" maxlength="40" autocomplete="username"',true)+input('currentPassword','Palavra-passe atual','','password','required autocomplete="current-password"',true),async data=>{
    const result=await api('change-username','POST',data);current=result.user;csrf=result.csrf;await load();toast('Utilizador alterado. Use o novo nome no próximo início de sessão.');
  },'Escolha um utilizador único na aplicação. As outras sessões desta conta serão terminadas.');
});
