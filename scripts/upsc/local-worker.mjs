/* Serve api/worker.js on loopback for the CI publisher.
 *
 * The publisher's model calls run here with the repository PERPLEXITY_API_KEY,
 * so publishing does not depend on Cloudflare credentials or a token shared
 * with the deployed Worker. The bearer token is random per run and never leaves
 * the runner.
 *
 * Usage: UPSC_PUBLISH_TOKEN=<random> node scripts/upsc/local-worker.mjs [port]
 * The token defaults to a random value; it is never printed.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import worker from '../../api/worker.js';

const port = Number(process.argv[2] || 8787);
const key = process.env.PERPLEXITY_API_KEY || '';
if (!key) {
  console.error('::error::PERPLEXITY_API_KEY is required to run the publisher Worker.');
  process.exit(1);
}
const token = process.env.UPSC_PUBLISH_TOKEN || crypto.randomBytes(32).toString('hex');
const env = { PERPLEXITY_API_KEY: key, UPSC_PUBLISH_TOKEN: token, ALLOWED_ORIGIN: 'https://sumanthbolle.com' };

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      ...(body && incoming.method !== 'GET' && incoming.method !== 'HEAD' ? { body } : {}),
    });
    const response = await worker.fetch(request, env, { waitUntil() {}, passThroughOnException() {} });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify({ success: false, error: String(error && error.message || error) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local UPSC Worker listening on http://127.0.0.1:${port}`);
});
