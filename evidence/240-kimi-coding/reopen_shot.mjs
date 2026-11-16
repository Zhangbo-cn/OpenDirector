/** No-key evidence: a saved Kimi Code connection reopens as the Kimi Code row. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "/home/zhang-pc/projects/OpenDirector/tests/browser/engine.mjs";
const web="http://127.0.0.1:5173", api="http://127.0.0.1:8000";
const out="/tmp/opendirector-kimi-coding";
const headers={"X-OpenDirector-Request":"1","Content-Type":"application/json"};
const pid=crypto.randomUUID();
await fetch(`${api}/api/creation/projects/${pid}/commands`,{headers,method:"POST",body:JSON.stringify({commandId:crypto.randomUUID(),projectId:pid,type:"project.create",payload:{name:`reopen ${pid.slice(0,8)}`}})});
await mkdir(out,{recursive:true});
const b=await launchBrowser();
const errors=[];
try{
for(const locale of ["zh-CN","en-US"]){
  const p=await b.newPage({locale,viewport:{width:1500,height:1000}});
  p.setDefaultTimeout(40000);
  p.on("request",r=>{ if(/api\.kimi\.com|moonshot\.(cn|ai)/.test(r.url())) errors.push("browser contacted Kimi"); });
  await p.addInitScript(([id,l])=>{localStorage.setItem("opendirector.locale.v1",l);localStorage.setItem("opendirector.modelSetup.v1","dismissed");localStorage.setItem("opendirector.lastUnifiedFilesystemProject",id);},[pid,locale]);
  const loading=p.locator(".canvas-loading-screen");
  for(let attempt=1;;attempt++){
    await p.goto(`${web}/ai-tool/ai-canvas/${pid}?creation=unified`);
    const ready=await loading.waitFor({state:"detached",timeout:20000}).then(()=>true,()=>false);
    if(ready) break;
    assert.ok(attempt<15,"canvas stays leased by the previous tab");
    await new Promise(r=>setTimeout(r,5000));
  }
  await p.getByRole("button",{name:locale==="zh-CN"?"设置":"Settings",exact:true}).click();
  await p.getByRole("button",{name:locale==="zh-CN"?"模型接入":"Model connections",exact:true}).click();
  await p.locator(".cw-model-setup-row").filter({hasText:locale==="zh-CN"?"文本模型":"Text model"}).getByRole("button").click();
  await p.getByRole("button",{name:locale==="zh-CN"?"对话":"Chat",exact:true}).click();
  const label=locale==="zh-CN"?"月之暗面 Kimi Code 订阅":"Moonshot Kimi Code subscription";
  // The saved connection shows the Kimi Code identity, not the open-platform one.
  const card=p.locator(".cw-model-setup-row, div").filter({hasText:"api.kimi.com"}).last();
  await p.getByText("https://api.kimi.com/coding/v1",{exact:false}).first().waitFor();
  // Scroll the Kimi Code card fully into view and assert its own identity line.
  const code=p.getByText(label,{exact:false}).first();
  await code.scrollIntoViewIfNeeded();
  await p.screenshot({path:`${out}/${locale}-3-saved-reopen.png`});
  console.log(locale, "identity:", (await code.textContent())?.trim());
  await p.close();
}
} finally { await b.close(); }
assert.deepEqual(errors,[]);
console.log("reopen evidence ok; project "+pid);
