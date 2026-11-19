// Retries only explicit credit exhaustion before any response is sent.
export class AccountPool {
  constructor({ candidates, send, now = Date.now, cooldownMs = 15 * 60_000 }) {
    Object.assign(this, { candidates, send, now, cooldownMs });
    this.blocked = new Map();
    this.preferred = null;
  }
  async entries() {
    const entries = await this.candidates();
    return [...entries].sort((a, b) => Number(b.uid === this.preferred) - Number(a.uid === this.preferred));
  }
  available(uid) { return (this.blocked.get(uid) || 0) <= this.now(); }
  async credential() {
    for (const entry of await this.entries()) {
      if (!this.available(entry.uid)) continue;
      try {
        const c = await entry.resolve();
        if (c?.uid === entry.uid) return c;
      } catch { /* Another saved account may still have a valid login. */ }
    }
    throw Object.assign(new Error('No available WorkBuddy account; replenish credits or sign in again'), { status: 402 });
  }
  async chat(body, signal) {
    let last;
    const attempted = new Set();
    for (const entry of await this.entries()) {
      signal.throwIfAborted();
      if (attempted.has(entry.uid) || !this.available(entry.uid)) continue;
      attempted.add(entry.uid);
      let credential;
      try { credential = await entry.resolve(); } catch { continue; }
      if (credential?.uid !== entry.uid) continue;
      signal.throwIfAborted();
      const result = await this.send(credential, body, signal);
      if (result.ok) { this.preferred = entry.uid; return result; }
      last = result;
      if (result.kind !== 'hard_credit') return result;
      this.blocked.set(entry.uid, this.now() + this.cooldownMs);
      // Each identity is attempted at most once per request, including concurrent rotations.
    }
    return last || { ok: false, kind: 'hard_credit', status: 402 };
  }
}
