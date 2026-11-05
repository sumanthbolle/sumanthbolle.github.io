/* Preserve the existing Worker, attach persistent Pocket storage and deploy. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function pocketNamespace(account, token, opener = fetch) {
  const accountBase = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
  const base = accountBase + '/storage/kv/namespaces';
  const title = 'wandering-haze-b394-UPSC_POCKET_FEED';
  async function call(url, method = 'GET', body) {
    const response = await opener(url, { method, signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      if (response.status === 404 && url.endsWith('/settings')) return null;
      throw new Error(`Cloudflare namespace request failed (HTTP ${response.status})`);
    }
    const data = await response.json();
    if (data.success !== true) throw new Error('Cloudflare rejected the namespace request');
    return data;
  }
  // Native Cloudflare builds can provision the declared binding. Reuse its
  // actual namespace rather than attaching a second, empty namespace later.
  const settings = await call(accountBase + '/workers/scripts/wandering-haze-b394/settings');
  const bound = settings?.result?.bindings?.find(row => row.type === 'kv_namespace' && row.name === 'UPSC_POCKET_FEED');
  if (bound) {
    if (!/^[a-f0-9]{32}$/.test(bound.namespace_id)) throw new Error('The existing Pocket binding has an invalid namespace ID');
    return bound.namespace_id;
  }
  for (let page = 1; ; page++) {
    const data = await call(base + `?per_page=1000&page=${page}`);
    const found = data.result.find(row => row.title === title);
    if (found) return found.id;
    if (page >= (data.result_info?.total_pages || 1)) break;
  }
  return (await call(base, 'POST', { title })).result.id;
}

export function deploymentConfig(config, root, account, namespace) {
  if (!/^[a-f0-9]{32}$/.test(namespace)) throw new Error('Cloudflare returned an invalid namespace ID');
  return { ...config, ...(account ? { account_id: account } : {}),
    main: path.resolve(root, config.main), keep_vars: true,
    kv_namespaces: [...(config.kv_namespaces || []).filter(row => row.binding !== 'UPSC_POCKET_FEED'),
      { binding: 'UPSC_POCKET_FEED', id: namespace }] };
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!dry && (!account || !token)) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN securely before deployment');
  const root = process.cwd();
  // The checked-in config uses JSON syntax despite its .jsonc extension.
  const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
  const namespace = dry ? '0'.repeat(32) : await pocketNamespace(account, token);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'upsc-worker-deploy-'));
  try {
    const file = path.join(folder, 'wrangler.json');
    fs.writeFileSync(file, JSON.stringify(deploymentConfig(config, root, account, namespace), null, 2));
    const result = spawnSync('npx', ['--yes', 'wrangler@4.149.0', 'deploy', '--config', file,
      ...(dry ? ['--dry-run', '--outdir', path.join(folder, 'build')] : [])], { stdio: 'inherit' });
    if (result.error) throw new Error('Could not start Wrangler');
    process.exitCode = result.status || 0;
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
