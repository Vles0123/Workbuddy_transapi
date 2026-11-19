import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.platform !== 'darwin') throw Error('Credential synchronization requires macOS');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const label = 'local.workbuddy-transapi.credential-sync';
const domain = `gui/${process.getuid()}`;
const dir = join(homedir(), 'Library/LaunchAgents');
const path = join(dir, label + '.plist');
const action = process.argv[2];
if (!['install', 'stop'].includes(action)) throw Error('Usage: node scripts/launch-sync.mjs install|stop');
spawnSync('launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' });
if (action === 'stop') { console.log('Credential sync stopped; exported files remain private on this Mac.'); process.exit(0); }
mkdirSync(dir, { recursive: true });
mkdirSync(join(root, 'runtime'), { recursive: true, mode: 0o700 });
chmodSync(join(root, 'runtime'), 0o700);
const xml = value => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
writeFileSync(path, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(root, 'host-sync.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>${xml(join(root, 'runtime/sync.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(root, 'runtime/sync.err.log'))}</string>
</dict></plist>`, { mode: 0o600 });
const result = spawnSync('launchctl', ['bootstrap', domain, path], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log('Credential synchronization installed for this macOS login.');
