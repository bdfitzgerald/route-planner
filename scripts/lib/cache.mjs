// JSON disk cache. Every external API response (DEM elevation, BRouter spurs)
// lands here and the directory is committed, so rebuilds are reproducible,
// work offline, and never re-spend a third-party rate limit.

import fs from 'node:fs';
import path from 'node:path';

export class JsonCache {
  constructor(filePath) {
    this.filePath = filePath;
    this.dirty = false;
    this.data = {};
    if (fs.existsSync(filePath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {
        // Keep the parse error as the cause: the message alone does not say where in
        // the file it failed, which is the useful part when a cache is truncated.
        throw new Error(`Cache at ${filePath} is corrupt (${err.message}). Delete it to rebuild.`, {
          cause: err,
        });
      }
    }
  }

  has(key) {
    return Object.hasOwn(this.data, key);
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.dirty = true;
  }

  get size() {
    return Object.keys(this.data).length;
  }

  flush() {
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    // Sort keys so the committed diff is stable between runs.
    const sorted = Object.fromEntries(
      Object.keys(this.data)
        .sort()
        .map((k) => [k, this.data[k]]),
    );
    fs.writeFileSync(this.filePath, `${JSON.stringify(sorted, null, 0)}\n`);
    this.dirty = false;
  }
}

export async function fetchJsonWithRetry(url, { attempts = 4, timeoutMs = 60000, label = '' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        const backoff = 1500 * 2 ** (attempt - 1);
        process.stderr.write(
          `    retry ${attempt}/${attempts - 1}${label ? ` (${label})` : ''}: ${err.message}; waiting ${backoff}ms\n`,
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw new Error(`Request failed after ${attempts} attempts${label ? ` (${label})` : ''}: ${lastError.message}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
