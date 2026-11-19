// Teste ponta a ponta: Firefox headless (mesmo Gecko do Zen) com a extensão
// carregada, clicando em links de um servidor local que imita os jeitos comuns
// de servir documentos. Rode com `pnpm test:e2e` (precisa de firefox e geckodriver no PATH).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Builder, By, until, type WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import type { Report } from '../src/testhook.ts';

const FIX = new URL('./fixtures/', import.meta.url).pathname;
const file = (n: string) => readFileSync(join(FIX, n));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// ---------- servidor ----------
const hits = new Map<string, number>();
const reports: Report[] = [];
const PAGE = `<!doctype html><meta charset="utf-8"><title>links</title>
<a id="inline" href="/files/sample.docx">docx inline</a>
<a id="attach" href="/download?id=7">pptx attachment</a>
<a id="gzip" href="/gz/planilha.xlsx">xlsx gzip</a>
<a id="auth" href="/auth/sample.docx">docx com cookie</a>
<a id="fake" href="/fake.docx">docx falso</a>
<a id="plain" href="/plain.html">html normal</a>
<a id="blank" href="/files/sample.pptx" target="_blank">pptx nova aba</a>
<form id="post" method="post" action="/post"><button id="postbtn">post</button></form>
<button id="iframebtn" onclick="var f=document.createElement('iframe');f.style.display='none';f.src='/frame-dl';document.body.append(f)">iframe</button>`;

function handler(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url!, 'http://x').pathname;
  hits.set(path, (hits.get(path) ?? 0) + 1);
  const send = (status: number, headers: Record<string, string>, body: Buffer | string) => {
    res.writeHead(status, headers);
    res.end(body);
  };
  switch (path) {
    case '/__report': {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        reports.push(JSON.parse(body));
        send(204, {}, '');
      });
      return;
    }
    case '/page.html':
      return send(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'sess=ok; Path=/' }, PAGE);
    case '/plain.html':
      return send(200, { 'Content-Type': 'text/html' }, '<title>plain</title><p id="plain">normal</p>');
    case '/files/sample.docx':
      return send(200, { 'Content-Type': MIME.docx }, file('sample.docx'));
    case '/files/sample.pptx':
      return send(200, { 'Content-Type': MIME.pptx }, file('sample.pptx'));
    case '/download':
      return send(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="x.pptx"; filename*=UTF-8''Apresenta%C3%A7%C3%A3o.pptx`,
      }, file('sample.pptx'));
    case '/gz/planilha.xlsx':
      return send(200, {
        'Content-Type': MIME.xlsx, 'Content-Encoding': 'gzip', 'Content-Disposition': 'attachment',
      }, gzipSync(file('sample.xlsx')));
    case '/auth/sample.docx':
      if (!/sess=ok/.test(req.headers.cookie ?? '')) return send(403, { 'Content-Type': 'text/plain' }, 'no');
      return send(200, { 'Content-Type': MIME.docx, 'Content-Disposition': 'attachment; filename=secreto.docx' }, file('sample.docx'));
    case '/post':
      if (req.method !== 'POST') return send(405, {}, '');
      return send(200, { 'Content-Type': MIME.docx, 'Content-Disposition': 'attachment; filename="post.docx"' }, file('sample.docx'));
    case '/frame-dl':
      return send(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="via-iframe.xlsx"' }, file('sample.xlsx'));
    case '/fake.docx':
      return send(200, { 'Content-Type': 'application/octet-stream' }, '<html>sessão expirada</html>');
    default:
      return send(404, {}, '');
  }
}

// ---------- browser ----------
async function startBrowser(xpi: string): Promise<WebDriver> {
  process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1'; // para o goBack() no contexto do browser
  const which = (b: string) => execFileSync('which', [b]).toString().trim();
  const opts = new firefox.Options().addArguments('-headless').setBinary(which('firefox'));
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(opts)
    .setFirefoxService(new firefox.ServiceBuilder(which('geckodriver')))
    .build();
  await (driver as firefox.Driver).installAddon(xpi, true);
  return driver;
}

// Espera o próximo relatório do viewer (ver src/testhook.ts).
async function nextReport(d: WebDriver): Promise<Report> {
  const n = reports.length;
  await d.wait(async () => reports.length > n, 20000, 'o viewer não abriu ou não terminou de renderizar');
  return reports[n]!;
}

// Mesmo Firefox, sem precisar trocar para a aba (o WebDriver não entra em moz-extension://)
async function goBack(d: WebDriver) {
  await (d as firefox.Driver).setContext(firefox.Context.CHROME);
  await d.executeScript('gBrowser.goBack()');
  await (d as firefox.Driver).setContext(firefox.Context.CONTENT);
}

// ---------- cenários ----------
type Ctx = { d: WebDriver; base: string };
const cases: [string, (c: Ctx) => Promise<void>][] = [
  ['docx com MIME correto abre na mesma aba, renderiza as duas páginas, e o "voltar" retorna à página', async ({ d, base }) => {
    await d.findElement(By.id('inline')).click();
    const r = await nextReport(d);
    assert.equal(r.state, 'ready');
    assert.equal(r.kind, 'docx');
    assert.match(r.text, /OMNI_DOCX_MARKER/);
    assert.match(r.text, /OMNI_DOCX_PAGE2/);
    assert.equal(r.docxPages, 2);
    assert.deepEqual(r.download, { name: 'sample.docx', sha: sha(file('sample.docx')) });
    assert.match(await d.getCurrentUrl(), /^moz-extension:\/\/.*viewer\.html/, 'não abriu na mesma aba');
    await goBack(d);
    await d.wait(async () => (await d.getCurrentUrl()) === `${base}/page.html`, 5000, 'voltar não foi para a página de origem');
  }],
  ['pptx com attachment + octet-stream usa o nome UTF-8 e renderiza os 2 slides', async ({ d }) => {
    await d.findElement(By.id('attach')).click();
    const r = await nextReport(d);
    assert.equal(r.kind, 'pptx');
    assert.equal(r.pptxSlides, 2);
    assert.match(r.text, /OMNI_PPTX_MARKER/);
    assert.match(r.text, /OMNI_PPTX_SLIDE2/);
    assert.equal(r.title, 'Apresentação.pptx');
    assert.deepEqual(r.download, { name: 'Apresentação.pptx', sha: sha(file('sample.pptx')) });
  }],
  ['xlsx com gzip: bytes descomprimidos corretos, abas e HTML de célula não vira elemento', async ({ d }) => {
    await d.findElement(By.id('gzip')).click();
    const r = await nextReport(d);
    assert.equal(r.kind, 'xlsx');
    assert.equal(r.title, 'planilha.xlsx');
    assert.deepEqual(r.download, { name: 'planilha.xlsx', sha: sha(file('sample.xlsx')) });
    assert.deepEqual(Object.keys(r.sheets), ['Primeira', 'Segunda']);
    assert.match(r.sheets.Primeira!, /OMNI_XLSX_MARKER/);
    assert.match(r.sheets.Primeira!, /<img src=x onerror=/); // aparece como texto
    assert.equal(r.sheetImgs, 0);
    assert.match(r.sheets.Segunda!, /OMNI_XLSX_SHEET2/);
  }],
  ['rota com cookie: usa a resposta original, sem baixar de novo', async ({ d }) => {
    await d.findElement(By.id('auth')).click();
    const r = await nextReport(d);
    assert.equal(r.kind, 'docx');
    assert.equal(r.title, 'secreto.docx');
    assert.equal(hits.get('/auth/sample.docx'), 1, 'o arquivo foi requisitado mais de uma vez');
  }],
  ['download via POST abre no viewer', async ({ d }) => {
    await d.findElement(By.id('postbtn')).click();
    const r = await nextReport(d);
    assert.equal(r.kind, 'docx');
    assert.equal(r.title, 'post.docx');
    assert.equal(hits.get('/post'), 1);
  }],
  ['link com target=_blank abre o viewer na nova aba e a original fica intacta', async ({ d, base }) => {
    const before = await d.getAllWindowHandles();
    await d.findElement(By.id('blank')).click();
    const r = await nextReport(d);
    assert.equal(r.kind, 'pptx');
    assert.equal((await d.getAllWindowHandles()).length, before.length + 1);
    assert.equal(await d.getCurrentUrl(), `${base}/page.html`);
  }],
  ['download disparado por iframe oculto abre o viewer em nova aba', async ({ d, base }) => {
    const before = await d.getAllWindowHandles();
    await d.findElement(By.id('iframebtn')).click();
    const r = await nextReport(d);
    assert.equal(r.kind, 'xlsx');
    assert.equal(r.title, 'via-iframe.xlsx');
    assert.equal((await d.getAllWindowHandles()).length, before.length + 1);
    assert.equal(await d.getCurrentUrl(), `${base}/page.html`);
  }],
  ['arquivo .docx que na verdade é HTML mostra erro, sem quebrar', async ({ d }) => {
    await d.findElement(By.id('fake')).click();
    const r = await nextReport(d);
    assert.equal(r.state, 'error');
    assert.match(r.text, /não é um documento Office válido/);
  }],
  ['página HTML comum não é interceptada', async ({ d, base }) => {
    await d.findElement(By.id('plain')).click();
    await d.wait(until.elementLocated(By.id('plain')), 5000);
    assert.equal(await d.getCurrentUrl(), `${base}/plain.html`);
  }],
];

// ---------- main ----------
const server = createServer(handler).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const out = mkdtempSync(join(tmpdir(), 'omni-e2e-'));
const dist = join(out, 'ext');
execFileSync('node', ['build.mjs', dist], { env: { ...process.env, OMNI_TEST_REPORT: `${base}/__report` }, stdio: 'inherit' });
execFileSync('npx', ['web-ext', 'build', '-s', dist, '-a', out, '-n', 'omni.xpi', '--overwrite-dest'], { stdio: 'ignore' });
const d = await startBrowser(join(out, 'omni.xpi'));
let failed = 0;
try {
  for (const [name, fn] of cases) {
    await d.get(`${base}/page.html`);
    try {
      await fn({ d, base });
      console.log(`✔ ${name}`);
    } catch (err) {
      failed++;
      console.log(`✖ ${name}\n  ${(err as Error).message.split('\n').join('\n  ')}`);
    }
  }
} finally {
  await d.quit();
  server.close();
}
console.log(`\n${cases.length - failed}/${cases.length} cenários passaram`);
process.exit(failed ? 1 : 0);
