// macOS-only helper: decrypt locally and export to a restricted, read-only container mount.
import { readdir, mkdir, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
process.env.DSH_HOME = join(root, 'runtime/host-data');
process.env.WORKBUDDY_ELECTRON_BIN ??= '/Applications/WorkBuddy.app/Contents/MacOS/Electron';
const { WorkBuddyCredentialStore } = await import('dsh-workbuddy-connect');
const output = join(root, 'runtime/accounts');
const backupDir = process.env.WORKDADDY_ACCOUNTS_DIR || join(homedir(), 'Library/Application Support/WorkDaddy/accounts');
await mkdir(output, {recursive:true,mode:0o700});
await chmod(output,0o700);
const stores = new Map();
const current = new WorkBuddyCredentialStore({refresh:()=>{throw Error('Exporter never refreshes tokens');}});
async function publish(name, c) {
  const auth = {accessToken:c.accessToken,refreshToken:c.refreshToken,expiresAt:c.expiresAtMs,refreshExpiresAt:c.refreshExpiresAtMs,domain:c.domain};
  const text = JSON.stringify({auth,account:{uid:c.uid,nickname:c.nickname,enterpriseId:c.enterpriseId}})+'\n';
  const tmp=join(output,name+'.tmp');
  await writeFile(tmp,text,{mode:0o600}); await rename(tmp,join(output,name));
}
async function sync() {
  let files;
  try { files=(await readdir(backupDir)).filter(x=>/^[A-Za-z0-9_-]+\.info$/.test(x)); }
  catch(e) { if(e.code!=='ENOENT') throw e; files=[]; }
  const wanted=new Set(files);
  for(const file of files) {
    if(!stores.has(file)) stores.set(file,new WorkBuddyCredentialStore({desktopPath:join(backupDir,file),ownPath:join(root,'runtime/unused',file),refresh:()=>{throw Error('read only');}}));
    try { const c=await stores.get(file).current(); if(c && c.uid===file.slice(0,-5)) await publish(file,c); else { await unlink(join(output,file)).catch(()=>{}); } }
    catch { await unlink(join(output,file)).catch(()=>{}); console.error('Account sync failed; re-open WorkBuddy to unlock login'); }
  }
  try { const c=await current.current(); if(c) { await publish('current.info',c);wanted.add('current.info'); } }
  catch { console.error('Desktop login sync unavailable'); }
  for(const f of await readdir(output)) if(f.endsWith('.info')&&!wanted.has(f)) await unlink(join(output,f));
  console.log(new Date().toISOString()+' synced '+files.length+' saved accounts');
}
do { try { await sync(); } catch { console.error('Credential sync failed; check local permissions'); } if(process.argv.includes('--once')) break; await new Promise(r=>setTimeout(r,30000)); } while(true);
