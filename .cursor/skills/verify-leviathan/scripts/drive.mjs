#!/usr/bin/env node
// Drive one mapped Leviathan dashboard feature against a running verification instance.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../..');
const feature = process.argv[2] || 'overview';
const verifyRoot = process.env.LEVIATHAN_VERIFY_ROOT || '/tmp/leviathan-verify';

function fail(message) {
  throw new Error(message);
}

function loadState() {
  let runId = process.env.RUN_ID;
  if (!runId) {
    const current = path.join(verifyRoot, 'current');
    if (!existsSync(current)) fail(`RUN_ID is unset and ${current} is missing`);
    runId = readFileSync(current, 'utf8').trim();
  }
  const statePath = path.join(verifyRoot, 'runs', runId, 'state.env');
  if (!existsSync(statePath)) fail(`missing ${statePath}`);
  const state = {};
  for (const line of readFileSync(statePath, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) state[match[1]] = match[2];
  }
  if (!state.BASE_URL || !state.EVIDENCE_DIR) fail(`incomplete state in ${statePath}`);
  return state;
}

function loadChromium() {
  const candidates = [];
  for (const entry of (process.env.NODE_PATH || '').split(path.delimiter)) {
    if (!entry) continue;
    candidates.push(path.join(entry, 'playwright'));
    candidates.push(path.join(entry, 'playwright-core'));
  }
  candidates.push(path.join(repoRoot, 'web/node_modules/playwright'));
  candidates.push(path.join(repoRoot, 'web/node_modules/playwright-core'));
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!existsSync(path.join(resolved, 'package.json'))) continue;
    const require = createRequire(path.join(resolved, 'package.json'));
    const loaded = require(resolved);
    if (loaded?.chromium) return loaded.chromium;
  }
  fail(
    [
      'Playwright is not installed for this drive.',
      'npm install --prefix /tmp/leviathan-verify-tools playwright-core',
      'NODE_PATH=/tmp/leviathan-verify-tools/node_modules node .cursor/skills/verify-leviathan/scripts/drive.mjs overview',
    ].join('\n'),
  );
}

function chromePath() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return fromEnv;
  for (const candidate of ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (existsSync(candidate)) return candidate;
  }
  fail('Set CHROME_PATH to a Chrome or Chromium binary');
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    const child = path.join(dir, name);
    const info = statSync(child);
    if (info.isDirectory()) found.push(...filesUnder(child));
    else found.push(child);
  }
  return found;
}

function formatBuildVersion(version) {
  const value = String(version ?? '').trim();
  if (!value) return 'unavailable';
  if (value.toLowerCase() === 'dev') return 'dev';
  return value.startsWith('v') || value.startsWith('V') ? value : `v${value}`;
}

async function driveOverview(page, state) {
  const requests = [];
  page.on('request', (request) => {
    requests.push({ url: request.url(), method: request.method(), postData: request.postData() });
  });
  const actions = [];
  await page.goto(`${state.BASE_URL}/#overview`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Overview', level: 1 }).waitFor({ timeout: 20_000 });
  await page.getByRole('status', { name: 'Connection status: Degraded' }).waitFor({ timeout: 20_000 });
  await page.getByText('1 active provider diagnostic.').waitFor();
  actions.push({
    action: 'open',
    url: page.url(),
    result: 'Overview heading visible, connection Degraded, one provider diagnostic',
  });

  const version = await (await page.request.get(`${state.BASE_URL}/api/v1/version`)).json();
  const snapshot = await (await page.request.get(`${state.BASE_URL}/api/v1/snapshot`)).json();
  const hostname = snapshot.host.hostname;
  await page.locator('header').getByText(hostname, { exact: true }).waitFor();
  await page.getByText(`Leviathan ${formatBuildVersion(version.version)}`).first().waitFor();

  const cpuText = await page.getByRole('button', { name: 'Inspect CPU resources' }).innerText();
  const ramText = await page.getByRole('button', { name: 'Inspect RAM resources' }).innerText();
  const gpuText = await page.getByRole('button', { name: 'Inspect GPU resources' }).innerText();
  const storageText = await page.getByRole('button', { name: 'Inspect Storage resources' }).innerText();
  if (!cpuText.includes('32') || !cpuText.includes('logical processors') || cpuText.includes('Utilization unavailable') || !/\d+(?:\.\d+)?%/.test(cpuText)) {
    fail(`CPU capacity card did not show the fixture measurement:\n${cpuText}`);
  }
  if (!ramText.includes('128.0 GiB')) fail(`RAM capacity card mismatch:\n${ramText}`);
  if (!storageText.includes('2.5 TiB')) fail(`Storage capacity card mismatch:\n${storageText}`);
  if (!gpuText.includes('Assignment or GPU discovery is incomplete') || !gpuText.includes('Incomplete')) {
    fail(`GPU capacity card did not report incomplete assignment discovery:\n${gpuText}`);
  }
  const diagnostics = snapshot.diagnostics ?? [];
  const stale = diagnostics.filter((item) => item.code === 'plugin_stale' && item.component === 'hardware');
  if (diagnostics.length !== 1 || stale.length !== 1 || stale[0].summary !== 'Source observation is unavailable or stale') {
    fail(`fixture diagnostics were not the single hardware plugin_stale warning: ${JSON.stringify(diagnostics)}`);
  }
  for (const id of ['host-cpu-chart', 'host-ram-chart', 'host-storage-chart', 'utilization-chart']) {
    await page.getByTestId(id).waitFor({ state: 'visible', timeout: 20_000 });
  }
  actions.push({
    action: 'read capacity and charts',
    cpu: cpuText.replaceAll('\n', ' '),
    ram: ramText.replaceAll('\n', ' '),
    gpu: gpuText.replaceAll('\n', ' '),
    storage: storageText.replaceAll('\n', ' '),
  });
  await page.screenshot({ path: path.join(state.EVIDENCE_DIR, 'overview-before.png'), fullPage: true });

  const chartWindow = page.getByRole('radiogroup', { name: 'Chart window' });
  if (!(await chartWindow.getByRole('radio', { name: '30m', exact: true }).isChecked())) {
    fail('Chart window did not open on the 30m preset');
  }
  const historyPromise = page.waitForRequest((request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/api/v1/history/aligned')) return false;
    try {
      return JSON.parse(request.postData() || '{}').window === '5m';
    } catch {
      return false;
    }
  });
  await chartWindow.getByText('5m', { exact: true }).click();
  const historyRequest = await historyPromise;
  const historyResponse = await historyRequest.response();
  if (!historyResponse || historyResponse.status() !== 200) {
    fail(`aligned history POST for 5m returned ${historyResponse ? historyResponse.status() : 'no response'}`);
  }
  if (!(await chartWindow.getByRole('radio', { name: '5m', exact: true }).isChecked())) {
    fail('5m chart window radio was not checked after the click');
  }
  const storedWindow = await page.evaluate(() => localStorage.getItem('leviathan.chartWindow.v1'));
  if (storedWindow !== '300000') fail(`localStorage chart window is ${storedWindow}`);
  actions.push({
    action: 'select chart window',
    from: '30m',
    to: '5m',
    localStorage: storedWindow,
    history: { method: 'POST', path: '/api/v1/history/aligned', window: '5m', status: historyResponse.status() },
  });
  await page.screenshot({ path: path.join(state.EVIDENCE_DIR, 'overview-5m.png'), fullPage: true });

  await page.getByRole('button', { name: 'Inspect CPU resources' }).click();
  await page.waitForURL(/#resources$/);
  await page.locator('#resource-cpu').waitFor({ state: 'visible' });
  await page.getByRole('region', { name: 'Motherboard resources' }).waitFor();
  const activeId = await page.evaluate(() => document.activeElement?.id ?? '');
  if (activeId !== 'resource-cpu') fail(`CPU heading was not focused (active=${activeId})`);
  const cpuHeading = (await page.locator('#resource-cpu').innerText()).replaceAll('\n', ' ');
  if (!cpuHeading.includes('CPU')) fail(`CPU heading text was ${cpuHeading}`);
  actions.push({
    action: 'inspect CPU resources',
    result: 'hash #resources, #resource-cpu focused, motherboard region visible',
    heading: cpuHeading,
  });
  await page.screenshot({ path: path.join(state.EVIDENCE_DIR, 'overview-cpu-resources.png'), fullPage: true });

  const offOrigin = requests
    .map((request) => request.url)
    .filter((url) => {
      const parsed = new URL(url);
      return parsed.protocol.startsWith('http') && parsed.hostname !== '127.0.0.1';
    });
  if (offOrigin.length) fail(`dashboard requested hosts other than loopback:\n${offOrigin.join('\n')}`);
  const log = readFileSync(state.LOG, 'utf8');
  if (log.includes('Yggdrasil uplink enabled')) fail('serve log shows the Yggdrasil uplink enabled');
  const stateFiles = filesUnder(state.XDG_STATE_HOME);
  if (stateFiles.length) fail(`fixture serve wrote state files: ${stateFiles.join(', ')}`);
  actions.push({
    action: 'observe fixture boundaries',
    uplinkEnabled: false,
    healthStateFiles: stateFiles,
    offOriginRequests: offOrigin,
  });

  const evidence = {
    feature: 'overview',
    baseUrl: state.BASE_URL,
    actions,
    snapshot: {
      hostname,
      cpuModel: snapshot.system.cpu.model,
      logicalProcessors: snapshot.system.cpu.logicalProcessors,
      gpuCount: snapshot.gpus.length,
      gpuName: snapshot.gpus[0]?.name ?? '',
      diagnostics: snapshot.diagnostics ?? [],
    },
    version,
    screenshots: ['overview-before.png', 'overview-5m.png', 'overview-cpu-resources.png'],
  };
  writeFileSync(path.join(state.EVIDENCE_DIR, 'overview-actions.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`overview evidence ${state.EVIDENCE_DIR}`);
}

const state = loadState();
if (feature !== 'overview') {
  fail(`drive.mjs implements overview. Follow features/${feature}.md for the other mapped journeys.`);
}
const chromium = loadChromium();
const browser = await chromium.launch({
  executablePath: chromePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  try {
    await driveOverview(page, state);
  } catch (error) {
    const failure = path.join(state.EVIDENCE_DIR, 'overview-failure.png');
    await page.screenshot({ path: failure, fullPage: true }).catch(() => undefined);
    writeFileSync(
      path.join(state.EVIDENCE_DIR, 'overview-failure.json'),
      `${JSON.stringify({ message: String(error?.stack || error), screenshot: existsSync(failure) ? 'overview-failure.png' : null }, null, 2)}\n`,
    );
    throw error;
  }
} finally {
  await browser.close();
}
