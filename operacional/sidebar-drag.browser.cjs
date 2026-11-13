const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('./server.cjs'),{seed}=require('./seed.cjs');
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lino-sidebar-drag-'));
  const app=createApplication({database:path.join(dir,'data.sqlite'),origin:'http://127.0.0.1:4197'});
  let browser;
  try {
    const password='Sidebar-Drag-Test-2026!';
    await seed(app.db,{lino:password,antonio:password,joao:password,rui:password});
    await new Promise(resolve=>app.server.listen(4197,'127.0.0.1',resolve));
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4197/app/');
    await page.getByLabel('Utilizador',{exact:true}).fill('lino');
    await page.getByLabel('Palavra-passe',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Entrar →',exact:true}).click();await page.locator('main h1').waitFor();
    const edge=page.getByRole('separator',{name:'Arrastar a barra lateral',exact:true});
    const geometry=()=>page.locator('.sidebar').evaluate(el=>({right:parseFloat(getComputedStyle(el.parentElement).getPropertyValue('--sidebar-visible-width')),width:el.offsetWidth,height:el.offsetHeight,padding:getComputedStyle(el).padding,brandTop:el.querySelector('.brand').getBoundingClientRect().top,brandLeft:el.querySelector('.brand').getBoundingClientRect().left,navLeft:el.querySelector('nav').getBoundingClientRect().left}));
    const initial=await geometry();assert.equal(initial.right,240);
    const drag=async dx=>{
      const b=await edge.boundingBox();await page.mouse.move(b.x+b.width/2,200);await page.mouse.down();
      await page.mouse.move(b.x+b.width/2+dx,200,{steps:10});await page.mouse.up();
    };
    await edge.hover();
    assert.equal(await edge.evaluate(el=>getComputedStyle(el).cursor),'ew-resize');
    assert.equal(await edge.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await drag(-100);let after=await geometry();assert.equal(after.right,140);
    for(const key of ['width','height','padding','brandTop','brandLeft','navLeft'])assert.equal(after[key],initial[key],key+' unchanged');
    assert.equal(await page.evaluate(()=>document.elementFromPoint(30,50)?.closest('.sidebar')!==null),true,'Left content stays visible');
    assert.equal(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).clipPath),'inset(0px 100px 0px 0px)');
    assert.equal(await page.locator('.main').evaluate(el=>el.getBoundingClientRect().left),140);
    await drag(-115);assert.equal((await geometry()).right,25,'Above threshold stays open');
    const thresholdEdge=await edge.boundingBox();
    await page.mouse.move(thresholdEdge.x+thresholdEdge.width/2,200);await page.mouse.down();
    await page.mouse.move(thresholdEdge.x+thresholdEdge.width/2-1,200);
    assert.equal((await geometry()).right,0,'24px closes immediately before release');
    assert(await page.getByRole('button',{name:'Mostrar barra lateral',exact:true}).isVisible());
    await page.mouse.up();
    assert(await edge.isVisible());assert(await page.locator('.sidebar').evaluate(el=>el.inert));
    const restore=page.getByRole('button',{name:'Mostrar barra lateral',exact:true});
    assert(await restore.isVisible());
    assert.equal(await page.locator('.main').evaluate(el=>el.getBoundingClientRect().left),0);
    assert.equal(await page.evaluate(()=>document.elementFromPoint(2,200)?.closest('.sidebar')??null),null);
    const headerPlacement=await page.evaluate(()=>{
      const b=document.querySelector('.sidebar-restore-button').getBoundingClientRect(),c=document.querySelector('.breadcrumb').getBoundingClientRect();
      return {left:b.right<c.left,aligned:Math.abs(b.y+b.height/2-c.y-c.height/2)<1,margin:b.left,gap:c.left-b.right};
    });
    assert.deepEqual(headerPlacement,{left:true,aligned:true,margin:16,gap:16});
    await restore.click();assert.equal((await geometry()).right,240);
    assert(!await restore.isVisible());
    assert(!await page.locator('.sidebar').evaluate(el=>el.inert));
    await edge.focus();await edge.press('Home');assert.equal((await geometry()).right,0);
    await edge.press('ArrowRight');assert.equal((await geometry()).right,34);
    await edge.press('ArrowLeft');assert.equal((await geometry()).right,0);
    await edge.press('End');assert.equal((await geometry()).right,240);
    await page.locator('.sidebar a[href="#obras"]').click();await page.locator('main h1').waitFor();
    assert.equal(await edge.count(),1);
    await page.setViewportSize({width:1000,height:800});assert.equal((await geometry()).right,205);
    for(const remainder of [3,2,1]) {
      await drag(remainder-205);assert.equal((await geometry()).right,0,`${remainder}px remainder snaps closed`);
      const gaps=await page.evaluate(()=>{const b=document.querySelector('.sidebar-restore-button').getBoundingClientRect(),c=document.querySelector('.breadcrumb').getBoundingClientRect();return [b.left,c.left-b.right];});
      assert.deepEqual(gaps,[16,16]);await restore.click();
    }
    await drag(-50);assert.equal((await geometry()).right,155);
    await page.setViewportSize({width:900,height:800});assert(!await edge.isVisible());
    assert.equal(await page.locator('.main').evaluate(el=>el.getBoundingClientRect().left),0);
    await page.setViewportSize({width:390,height:844});assert(!await edge.isVisible());
    assert(await page.locator('.sidebar nav').isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.setViewportSize({width:1440,height:1000});
    assert.equal((await geometry()).right,155);
    assert.deepEqual(errors,[]);
    console.log('PASS: horizontal drag to fully hidden, header menu aligned left of breadcrumb, restore button, unchanged content placement, transparent edge, original maxima, keyboard, route changes, responsive layouts, no JS errors.');
  } finally {
    if(browser)await browser.close();await app.close();
    assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'lino-sidebar-drag-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
