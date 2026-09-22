'use strict';
const byId = id => document.getElementById(id);
const MAX = 1000000;
function readManifest(raw) {
  if (!raw.trim()) throw new Error('Both manifests are required.');
  if (raw.length > MAX) throw new Error('Each manifest must be smaller than 1 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error('DTD and entity declarations are not supported.');
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'manifest') throw new Error('Provide valid XML with a manifest root element.');
  const nodes = name => [...doc.getElementsByTagNameNS('*',name)];
  const resources = new Map();
  for (const r of nodes('resource')) {
    const id = r.getAttribute('identifier');
    if (!id || resources.has(id)) throw new Error('Missing or duplicate resource identifiers require manual review.');
    resources.set(id, {href:r.getAttribute('href')||'', type:r.getAttribute('type')||'', scormType:r.getAttributeNS('http://www.adlnet.org/xsd/adlcp_rootv1p2','scormtype')||r.getAttributeNS('http://www.adlnet.org/xsd/adlcp_v1p3','scormType')||'', base:r.getAttributeNS('http://www.w3.org/XML/1998/namespace','base')||'', files:[...r.getElementsByTagNameNS('*','file')].map(f=>f.getAttribute('href')||'').sort(), dependencies:[...r.getElementsByTagNameNS('*','dependency')].map(x=>x.getAttribute('identifierref')||'').sort()});
  }
  const items = nodes('item').map(x=>({id:x.getAttribute('identifier')||'',ref:x.getAttribute('identifierref')||'',title:[...x.children].find(c=>c.localName==='title')?.textContent||''}));
  const ids=new Set();for(const i of items){if(!i.id||ids.has(i.id))throw new Error('Missing or duplicate item identifiers require manual review.');ids.add(i.id);}
  const broken=items.filter(i=>i.ref&&!resources.has(i.ref)).map(i=>i.id+' → '+i.ref);
  return {version:nodes('schemaversion')[0]?.textContent?.trim()||'not declared',resources,items,broken};
}
function compareManifests(a,b) {
  const old=readManifest(a),next=readManifest(b),lines=['OWNWARD LAB — manifest comparison','Static metadata only. Test both releases in your target LMS.',''];
  if(old.version!==next.version)lines.push('VERSION: '+old.version+' → '+next.version);
  for(const [id,r] of old.resources){if(!next.resources.has(id))lines.push('REMOVED resource: '+id);else if(JSON.stringify(r)!==JSON.stringify(next.resources.get(id)))lines.push('CHANGED resource: '+id+'\n  old: '+JSON.stringify(r)+'\n  new: '+JSON.stringify(next.resources.get(id)));}
  for(const id of next.resources.keys())if(!old.resources.has(id))lines.push('ADDED resource: '+id);
  if(JSON.stringify(old.items)!==JSON.stringify(next.items))lines.push('ITEM STRUCTURE / TITLES / REFERENCES CHANGED\n  old: '+JSON.stringify(old.items)+'\n  new: '+JSON.stringify(next.items));
  if(old.broken.length)lines.push('OLD unresolved resource references: '+old.broken.join(', '));
  if(next.broken.length)lines.push('NEW unresolved resource references: '+next.broken.join(', '));
  if(lines.length===3)lines.push('No differences found in the fields checked. Other XML settings and actual course files were not compared.');
  lines.push('\nReview checklist: launch, completion, score, resume, existing learner state.\nNot checked: sequencing, mastery settings, nested manifests, resolved xml:base paths, package assets, actual runtime or compatibility. No safe-to-overwrite conclusion is made.');
  return lines.join('\n');
}
let report='';
function invalidate(){report='';byId('download').disabled=true;byId('result').textContent='Inputs changed. Compare again to generate a current report.';}
for(const key of ['old','new']){
 byId(key).addEventListener('input',invalidate);
 byId(key+'file').addEventListener('change',async e=>{invalidate();const f=e.target.files[0];if(!f)return;byId(key).value='';if(f.size>MAX){byId('result').textContent='File exceeds the 1 MB limit.';return;}try{byId(key).value=await f.text();}catch{byId('result').textContent='Could not read that file.';}});
}
byId('compare').addEventListener('click',()=>{invalidate();try{report=compareManifests(byId('old').value,byId('new').value);byId('result').textContent=report;byId('download').disabled=false;}catch(e){byId('result').textContent=e.message;}});
byId('sample').addEventListener('click',()=>{invalidate();byId('old').value='<manifest><metadata><schemaversion>1.2</schemaversion></metadata><organizations><organization identifier="org"><item identifier="lesson" identifierref="r1"><title>Safety</title></item></organization></organizations><resources><resource identifier="r1" href="index.html" type="webcontent"><file href="index.html"/></resource></resources></manifest>';byId('new').value=byId('old').value.replaceAll('index.html','start.html').replace('Safety','Safety — updated');byId('compare').click();});
byId('download').addEventListener('click',()=>{if(!report)return;const u=URL.createObjectURL(new Blob([report],{type:'text/plain'}));const a=document.createElement('a');a.href=u;a.download='ownward-manifest-report.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
