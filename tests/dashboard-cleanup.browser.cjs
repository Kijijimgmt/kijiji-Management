const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let failFiles=true;const now=new Date(); const date=new Date(now.getTime()+86400000).toISOString().slice(0,10);
 const client={id:'medusa',name:'Medusa',status:'Active',owner:'Erik',category:'Artist'};
 const emptyClient={id:'writer',name:'Writer',status:'Active',owner:'Joe',category:'Screenwriter'};
 const files=[{id:'contract',name:'Performance agreement',category:'Contract',clientIds:['medusa'],updatedAt:new Date().toISOString(),fileName:'contract.pdf',notionUrl:'https://www.notion.so/example'}];
 const google={configured:true,canManage:true,scheduler:{enabled:false},connection:{status:'connected',canCreate:false},links:[{id:'link',clientId:'medusa',calendarName:'Medusa schedule',status:'connected',lastSuccessAt:'2026-11-05T19:45:21Z',color:'#246b8e',events:[{id:'google1',name:'Shared client appearance',start:date+'T19:00:00-05:00',end:date+'T20:00:00-05:00',allDay:false}]}]};
 await page.addInitScript(()=>{localStorage.setItem('kijiji-dashboard-tour-v4:max@kijijimgmt.com','complete');window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}}),onAuthStateChange(){}}})}});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='cleanup.test')return route.fulfill({body:''});
  if(url.pathname.startsWith('/api/')){
   let data={};let status=200;
   if(url.pathname.endsWith('auth-config'))data={supabaseUrl:'https://auth.test',supabasePublishableKey:'test'};
   else if(url.pathname.endsWith('notion-documents')){
    if(url.searchParams.get('view')==='insights')data={submissions:[{id:'assessment',artistName:'Sample artist',submittedAt:'2026-11-11',priority:'Brand partnerships',obstacle:'Build a sustainable release plan with realistic resources.',helpAreas:'Website and booking materials',answers:[{question:'What would success look like?',answer:'Consistent releases and repeat opportunities.'}]}],briefs:[{id:'brief',title:'Sample industry brief',issueDate:'2026-11-11',status:'Published',summary:'A short weekly update.',keyMoves:'Review relevant opportunities.',watchlist:'Upcoming release windows'}],integrations:{jotform:{configured:true},industryBriefs:{configured:true}}};
    else {status=failFiles?503:200;data=failFiles?{message:'Share the Kijiji Document Library with the portal integration.'}:{documents:files};}
   }else if(url.searchParams.get('view')==='google-calendar')data=google;
   else if(url.searchParams.get('view')==='artist-workspace')data={entries:[],aiReady:false};
   else if(url.pathname.endsWith('notion-clients'))data={clients:[client,emptyClient,{id:'jason',name:'Jason Mendoza',status:'Active',owner:'Joe'},{id:'river',name:'The Ballad of River Kendricks',status:'Active',owner:'Joe, Erik, Maxwell',stage:'Fully written mini-series. Genre and logline available under NDA.',notes:'Record type: Scripted project\nWriter: Jason Mendoza\nFormat: Scripted series\nScope: 5 seasons × 8 episodes\nWriting status: Fully written'},{id:'whitman',name:'Whitman',status:'Active',notes:'Record type: Scripted project\nWriter: Jason Mendoza\nFormat: Feature film\nWriting status: Completed screenplay'},{id:'jazz',name:'Jazz on a Summer Night',status:'Active',notes:'Record type: Scripted project\nWriter: Jason Mendoza\nFormat: Feature film\nWriting status: Completed screenplay'}],actions:[{id:'t1',title:'Review appearance contract',clientIds:['medusa'],owner:'Maxwell',status:'Open',dueDate:date},{id:'t2',title:'Clarify campaign scope',clientIds:['medusa'],owner:'Unassigned',status:'Open'}],events:[],opportunities:[{id:'o1',name:'Brand pitch',owner:'Erik',stage:'New',clientIds:['medusa']}],googleCalendar:google,teamMeeting:{label:'Kijiji team meeting',url:'https://us02web.zoom.us/j/123456789?pwd=sample'},source:{user:{email:'max@kijijimgmt.com',owner:'Maxwell',fullName:'Maxwell',isAdmin:true}}};
   return route.fulfill({status,json:data});
  }
  const name=url.pathname==='/'?'client-portal.html':url.pathname.slice(1),file=path.join(__dirname,'..',name);
  if(!fs.existsSync(file))return route.fulfill({status:404});return route.fulfill({path:file,contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'image/jpeg'});
 });
 await page.goto('https://cleanup.test/#my-work');await page.locator('[data-home-open]').getByText('2',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-home-setup]').textContent(),'1');
 assert(await page.locator('.home-industry').getByText('Sample industry brief',{exact:true}).isVisible());
 assert.equal(await page.getByRole('link',{name:'Join team meeting ↗',exact:true}).getAttribute('href'),'https://us02web.zoom.us/j/123456789?pwd=sample');
 assert.equal(await page.locator('details.home-industry').count(),0);
 await page.locator('.skip-link').focus();assert.equal(await page.locator('.skip-link').evaluate(el=>getComputedStyle(el).clipPath),'none');await page.locator('.skip-link').evaluate(el=>el.blur());
 await page.locator('[data-home-owner]').selectOption('me');assert.equal(await page.locator('[data-home-open]').textContent(),'1');assert.equal(await page.locator('[data-home-setup]').textContent(),'0');
 await page.locator('[data-home-owner]').selectOption('');
 assert(await page.locator('[data-home-schedule]').getByText('Shared client appearance',{exact:true}).isVisible());
 assert.match(await page.locator('[data-home-calendar-status]').textContent(),/needs? an update/);
 await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/kijiji-cleanup-home-desktop.png',fullPage:true});
 await page.locator('[data-home-work-filter="setup"]').click();await page.locator('.compact-task-row').waitFor();assert.equal(await page.locator('.compact-task-row').count(),1);assert.match(await page.locator('.compact-task-row').textContent(),/Clarify campaign scope/);
 await page.locator('.portal-nav a[href="#opportunities"]').click();await page.locator('#opportunities').waitFor({state:'visible',timeout:5000});assert(await page.locator('#actions').isHidden());
 assert.equal(new URL(page.url()).hash,'#opportunities');
 await page.locator('[data-pipeline-client]').selectOption('writer');await page.getByText('No matching opportunities',{exact:true}).waitFor();await page.locator('[data-pipeline-client]').selectOption('');
 await page.locator('[data-pipeline-view="list"]').click();assert(await page.locator('.pipeline-list-view').isVisible());
 await page.locator('[data-pipeline-search]').fill('does not exist');await page.getByText('No matching opportunities',{exact:true}).waitFor();
 await page.locator('[data-pipeline-search]').fill('Brand');await page.locator('[data-pipeline-grid] [data-opportunity-id]').click();await page.locator('[data-opportunity-dialog]').waitFor({state:'visible'});
 await page.locator('[data-close-opportunity-form]').first().click();await page.locator('[data-pipeline-view="board"]').click();
 await page.screenshot({path:'/tmp/kijiji-workspace-opportunities.png',fullPage:true});
 await page.locator('.portal-nav a[href="#work"]').click();await page.locator('#opportunities').waitFor({state:'hidden'});
 await page.locator('[data-task-queue-filter]').selectOption('done');await page.getByText('No completed tasks',{exact:true}).waitFor();await page.locator('[data-task-queue-filter]').selectOption('open');
 await page.locator('.compact-task-row .task-title-button').first().click();await page.locator('[data-action-dialog]').waitFor({state:'visible'});await page.locator('[data-close-action-form]').first().click();
 await page.screenshot({path:'/tmp/kijiji-workspace-tasks.png',fullPage:true});
 await page.locator('.portal-nav a[href="#clients"]').click();await page.getByRole('button',{name:'Open Writer client roadmap',exact:true}).waitFor();assert.match(await page.getByRole('button',{name:'Open Writer client roadmap',exact:true}).textContent(),/Needs next action/);

 await page.getByRole('link',{name:'Company & production projects ↗',exact:true}).click();await page.locator('#projects').waitFor({state:'visible'});assert.equal(await page.locator('.slate-card').count(),3);assert(await page.getByText('5 seasons × 8 episodes',{exact:true}).isVisible());
 await page.locator('[data-open-project="river"]').click();await page.getByRole('heading',{name:'The Ballad of River Kendricks',exact:true}).waitFor();await page.getByRole('heading',{name:'Project overview',exact:true}).waitFor();assert(await page.locator('[data-client-detail]').getByText('Written by Jason Mendoza',{exact:true}).isVisible());
 await page.locator('.portal-nav a[href="#clients"]').click();await page.getByRole('button',{name:'Open Jason Mendoza client roadmap',exact:true}).click();await page.getByRole('heading',{name:'Projects written by Jason Mendoza',exact:true}).waitFor();assert.equal(await page.locator('.writer-project-link').count(),3);
 await page.locator('.nav-more > summary').click();await page.locator('.portal-nav a[href="#files"]').click();
 assert.equal(await page.locator('[data-document-count]').textContent(),'File count unavailable');assert.match(await page.locator('[data-document-folders]').textContent(),/Not loaded/);
 failFiles=false;await page.getByRole('button',{name:'Retry files',exact:true}).click();await page.getByRole('heading',{name:'Performance agreement',exact:true}).waitFor();
 assert.equal(await page.locator('[data-document-count]').textContent(),'1 file');
 // A subsequent failed global refresh must preserve the known files.
 failFiles=true;await page.getByRole('button',{name:'Sync Now',exact:true}).click();await page.getByText('Showing the last loaded files.',{exact:true}).waitFor();assert(await page.getByRole('heading',{name:'Performance agreement',exact:true}).isVisible());
 assert.match(await page.locator('[data-document-count]').textContent(),/saved view/);
 await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/kijiji-cleanup-files-desktop.png',fullPage:true});
 await page.locator('.nav-more > summary').click();assert.equal(await page.locator('.nav-more a').count(),3);
 await page.locator('.nav-more > summary').click();
 for(const hash of ['clients','calendar','reports','guidance','projects']) {
  await page.evaluate(hash=>{location.hash=hash;document.body.classList.remove('client-workspace-open')},hash);
  await page.waitForTimeout(150);await page.screenshot({path:'/tmp/kijiji-workspace-'+hash+'.png',fullPage:true});
 }
 for(const theme of ['light','dark']) {
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;location.hash='reports'},theme);
  await page.locator('#reports').waitFor({state:'visible'});
  await page.getByText('Sample artist',{exact:true}).waitFor();
  const surface=await page.locator('.assessment-card').evaluate(el=>({background:getComputedStyle(el).backgroundColor,surface:getComputedStyle(document.querySelector('.report-feed')).backgroundColor,color:getComputedStyle(el.querySelector('h4')).color}));
  assert.equal(surface.background,surface.surface,`${theme} assessment must use the themed report surface`);assert.notEqual(surface.background,surface.color);
  await page.locator('.assessment-card summary').click();assert(await page.getByText('Consistent releases and repeat opportunities.',{exact:true}).isVisible());await page.locator('.assessment-card summary').click();
  assert(await page.locator('[data-build-strategy]').isVisible());
  await page.screenshot({path:'/tmp/kijiji-reports-'+theme+'.png',fullPage:true});
 }
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});
   for(const hash of ['my-work','work','opportunities','clients','projects','calendar','files','reports','guidance','decisions','talent-bookings']){
    await page.evaluate(hash=>{location.hash=hash;document.body.classList.remove('client-workspace-open')},hash);
    await page.waitForTimeout(30);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} ${width} ${hash} page overflow`);
   }
  }
 }
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';location.hash='my-work';window.scrollTo(0,0)});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await page.screenshot({path:'/tmp/kijiji-cleanup-home-mobile.png',fullPage:true});
 await page.locator('.account-trigger').click();await page.locator('[data-logout-portal]').click();assert.equal(await page.locator('[data-home-team-meeting] a').count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: Home owner/count filters, Google commitments/status, setup queue, opportunity route, empty-client health, file retry and snapshot retention, light/dark responsive routes.');
})().catch(e=>{console.error(e);process.exit(1)});
