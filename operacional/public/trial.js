'use strict';
// The server enforces access on every API call. Polling clears an idle screen too.
async function checkTrial(){
 try{
  const response=await fetch('/api/access',{cache:'no-store'}),result=await response.json();
  if(result.code==='TRIAL_BLOCKED'){
   if(current){current=null;state=null;users=[];events=[];csrf='';$('#modal').close();login();}
   if($('#login-error'))$('#login-error').textContent=result.error;
   return;
  }
  const main=$('#app');if(!response.ok||!current||!main||!result.access?.expiresAt)return;
  let notice=$('#trial-notice');if(!notice){notice=document.createElement('div');notice.id='trial-notice';notice.className='notice';notice.setAttribute('role','status');main.prepend(notice);}
  notice.textContent='Acesso de demonstração até '+new Date(result.access.expiresAt).toLocaleString('pt-PT',{timeZone:'Europe/Lisbon'})+' (Lisboa). Para prolongar, contacte o responsável pela aplicação.';
 }catch{/* Connectivity failures do not decide licensing; API access remains server-enforced. */}
}
document.addEventListener('DOMContentLoaded',()=>{checkTrial();setInterval(checkTrial,15000);});
window.addEventListener('hashchange',()=>{setTimeout(checkTrial,0);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkTrial();});
