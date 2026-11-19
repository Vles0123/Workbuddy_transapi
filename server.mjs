import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { AccountPool } from './account-pool.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const data = process.env.WORKBUDDY_DATA_DIR || join(root, 'data');
mkdirSync(data, { recursive: true, mode: 0o700 });
chmodSync(data, 0o700);
process.env.DSH_HOME = data;
process.env.WORKBUDDY_ELECTRON_BIN ??= '/Applications/WorkBuddy.app/Contents/MacOS/Electron';
const { WorkBuddyCredentialStore, WorkBuddyUpstreamClient, prepareChatBody } = await import('dsh-workbuddy-connect');
const keyPath = join(data, 'api-key');
let apiKey;
try { apiKey = readFileSync(keyPath, 'utf8').trim(); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  apiKey = 'wb-local-' + randomBytes(32).toString('hex');
  writeFileSync(keyPath, apiKey + '\n', { mode: 0o600, flag: 'wx' });
}
if (apiKey.length < 32) throw new Error('Invalid local API key');
chmodSync(keyPath, 0o600);
const apiKeys = [apiKey];
const additionalKeyPath = join(data, 'additional-api-keys.json');
try {
  const additionalKeys = JSON.parse(readFileSync(additionalKeyPath, 'utf8'));
  if (!Array.isArray(additionalKeys) || additionalKeys.some(key => typeof key !== 'string' || key.length < 32 || /\s/.test(key))) {
    throw new Error('Invalid additional local API keys');
  }
  apiKeys.push(...additionalKeys);
  chmodSync(additionalKeyPath, 0o600);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const client = new WorkBuddyUpstreamClient();
const store = new WorkBuddyCredentialStore({ refresh: credential => client.refreshToken(credential) });
const backupDir = process.env.WORKDADDY_ACCOUNTS_DIR || join(homedir(), 'Library/Application Support/WorkDaddy/accounts');
const poolDir = join(data, 'account-pool');
mkdirSync(poolDir, { recursive: true, mode: 0o700 });
const accountStores = new Map();
async function candidates() {
  const entries = new Map();
  try {
    const current = await store.current();
    if (current) entries.set(current.uid, { uid: current.uid, resolve: () => store.resolve() });
  } catch { /* Saved WorkDaddy accounts remain usable if the desktop login is unavailable. */ }
  let files = [];
  try { files = await readdir(backupDir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const file of files.sort()) {
    if (file === 'current.info' || !/^[A-Za-z0-9_-]+\.info$/.test(file)) continue;
    const uid = file.slice(0, -5);
    if (entries.has(uid)) continue;
    if (!accountStores.has(uid)) accountStores.set(uid, new WorkBuddyCredentialStore({
      desktopPath: join(backupDir, file), ownPath: join(poolDir, file),
      refresh: credential => client.refreshToken(credential),
    }));
    entries.set(uid, { uid, resolve: () => accountStores.get(uid).resolve() });
  }
  return [...entries.values()];
}
const catalogs = new Map();
async function models(credential) {
  credential ??= await pool.credential();
  const identity = `${credential.uid}:${credential.enterpriseId ?? ''}`;
  let cached = catalogs.get(identity);
  if (!cached || Date.now() - cached.time >= 300000) {
    cached = { time: Date.now(), promise: client.fetchModels(credential, AbortSignal.timeout(20000)) };
    catalogs.set(identity, cached);
    cached.promise.catch(() => { if (catalogs.get(identity) === cached) catalogs.delete(identity); });
  }
  return cached.promise;
}
const pool = new AccountPool({ candidates, send: async (credential, body, signal) => {
  if (!(await models(credential)).some(m => m.id === body.model)) return { ok: false, kind: 'model_not_found', status: 400 };
  return client.chatStream(credential, prepareChatBody(JSON.stringify(body)), signal);
} });
const allowedHosts = new Set(['127.0.0.1', 'localhost', 'host.docker.internal', '[::1]']);
function hostAllowed(host) {
  try { return allowedHosts.has(new URL(`http://${host}`).hostname); } catch { return false; }
}
function originAllowed(origin) {
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && hostAllowed(url.host); }
  catch { return false; }
}
function authorized(header) {
  const value = /^Bearer\s+(.+)$/i.exec(header ?? '')?.[1] ?? '';
  const a = Buffer.from(value);
  return apiKeys.some(key => {
    const b = Buffer.from(key);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
function fail(res, status, code, message) { json(res, status, { error: { type: code, code, message } }); }
async function bodyJson(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}
async function aggregate(response, model) {
  let pending = '', total = 0, done = false, usage, id, created;
  const decoder = new TextDecoder();
  const choices = new Map();
  function event(block) {
    const text = block.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trimStart()).join('\n').trim();
    if (!text) return;
    if (text === '[DONE]') { done = true; return; }
    const obj = JSON.parse(text);
    if (obj.error) throw new Error('Upstream returned a stream error');
    id ??= obj.id; created ??= obj.created;
    if (obj.usage) usage = obj.usage;
    for (const part of obj.choices ?? []) {
      const index = part.index ?? 0;
      if (!choices.has(index)) choices.set(index, { index, message: { role: 'assistant', content: null }, finish_reason: null, tools: new Map() });
      const choice = choices.get(index), delta = part.delta ?? part.message ?? {};
      for (const field of ['content', 'reasoning_content', 'reasoning']) if (typeof delta[field] === 'string') choice.message[field] = (choice.message[field] ?? '') + delta[field];
      for (const tool of delta.tool_calls ?? []) {
        const i = tool.index ?? 0;
        if (!choice.tools.has(i)) choice.tools.set(i, { id: '', type: 'function', function: { name: '', arguments: '' } });
        const target = choice.tools.get(i);
        if (tool.id) target.id = tool.id;
        if (tool.type) target.type = tool.type;
        if (tool.function?.name) target.function.name += tool.function.name;
        if (tool.function?.arguments) target.function.arguments += tool.function.arguments;
      }
      if (part.finish_reason) choice.finish_reason = part.finish_reason;
    }
  }
  for await (const bytes of response.body) {
    total += bytes.length;
    if (total > 64 * 1024 * 1024) throw new Error('Response too large');
    pending += decoder.decode(bytes, { stream: true });
    pending = pending.replace(/\r\n/g, '\n');
    let end;
    while ((end = pending.indexOf('\n\n')) >= 0) { event(pending.slice(0, end)); pending = pending.slice(end + 2); }
  }
  pending += decoder.decode();
  if (pending.trim()) event(pending);
  if (!choices.size || (!done && [...choices.values()].some(x => !x.finish_reason))) throw new Error('Incomplete upstream response');
  return { id: id ?? `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: created ?? Math.floor(Date.now()/1000), model,
    choices: [...choices.values()].sort((a,b) => a.index-b.index).map(({ tools, ...choice }) => {
      if (tools.size) choice.message.tool_calls = [...tools.entries()].sort((a,b) => a[0]-b[0]).map(x => x[1]);
      choice.finish_reason ??= tools.size ? 'tool_calls' : 'stop';
      return choice;
    }), ...(usage ? { usage } : {}) };
}
const server = createServer(async (req, res) => {
  try {
    if (!hostAllowed(req.headers.host)) return fail(res, 403, 'host_not_allowed', 'Local hosts only');
    if (req.headers.origin && !originAllowed(req.headers.origin)) return fail(res, 403, 'origin_not_allowed', 'Local origins only');
    if (!authorized(req.headers.authorization)) return fail(res, 401, 'invalid_api_key', 'Missing or invalid API key');
    const path = new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '') || '/';
    if (req.method === 'GET' && path === '/healthz') return json(res, 200, { ok: true, service: 'local-workbuddy-api' });
    if (req.method === 'GET' && path === '/v1/models') return json(res, 200, { object: 'list', data: (await models()).map(m => ({ id: m.id, object: 'model', created: 0, owned_by: 'workbuddy', context_window: m.contextWindow, max_tokens: m.maxTokens, billing: m.billing })) });
    if (req.method !== 'POST' || path !== '/v1/chat/completions') return fail(res, 404, 'not_found', 'Supported routes: /v1/models, /v1/chat/completions');
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return fail(res, 415, 'unsupported_media_type', 'Content-Type must be application/json');
    const body = await bodyJson(req);
    if (!body || !Array.isArray(body.messages) || !body.messages.length || typeof body.model !== 'string') return fail(res, 400, 'invalid_request_error', 'model and messages are required');
    const controller = new AbortController();
    res.once('close', () => controller.abort());
    const result = await pool.chat(body, AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]));
    if (!result.ok) {
      const status = { hard_credit: 402, soft_rate: 429, session_dead: 401, client: 400, model_not_found: 400 }[result.kind] ?? 502;
      return fail(res, status, result.kind, `WorkBuddy request failed (${result.kind}, HTTP ${result.status})`);
    }
    if (body.stream === true) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      await pipeline(Readable.fromWeb(result.response.body), res);
    } else json(res, 200, await aggregate(result.response, body.model));
  } catch (error) {
    if (!res.headersSent) fail(res, error.status ?? 502, 'gateway_error', error.status ? error.message : 'WorkBuddy unavailable; check desktop login and retry');
    else res.destroy();
  }
});
server.requestTimeout = 330000;
server.headersTimeout = 30000;
server.listen(3081, process.env.WORKBUDDY_LISTEN_HOST || '127.0.0.1', () => console.log('WorkBuddy API listening at http://127.0.0.1:3081/v1'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
