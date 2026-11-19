import { renderAsync as renderDocx } from 'docx-preview';
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { Entry } from './background.ts';
import type { Kind } from './detect.ts';
import { anchoredScroll, clampZoom, wheelDeltaPx, zoomFromWheel, zoomStep } from './zoom.ts';

type ViewEntry = Omit<Entry, 'kind'> & { kind: Kind | null };

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const params = new URLSearchParams(location.search);

declare const OMNI_TEST_REPORT: string;

function setState(state: string, extra: Record<string, string> = {}) {
  document.body.dataset.state = state;
  Object.assign(document.body.dataset, extra);
  if (OMNI_TEST_REPORT && (state === 'ready' || state === 'error')) {
    import('./testhook.ts').then((t) => t.report(OMNI_TEST_REPORT));
  }
}

// O tipo vindo do header/nome é só um palpite: confere a estrutura do pacote OOXML.
async function sniffKind(data: ArrayBuffer): Promise<Kind | null> {
  const zip = await JSZip.loadAsync(data);
  if (zip.file('word/document.xml')) return 'docx';
  if (zip.file('ppt/presentation.xml')) return 'pptx';
  if (zip.file('xl/workbook.xml')) return 'xlsx';
  return null;
}

async function loadFromParams(): Promise<ViewEntry | null> {
  const id = params.get('id');
  if (id) {
    const entry: Entry | null = await browser.runtime.sendMessage({ type: 'get', id });
    if (entry) return entry;
  }
  // Ex.: aba restaurada depois de reiniciar o navegador; a memória do background se perdeu.
  const src = params.get('src');
  if (src) {
    const resp = await fetch(src, { credentials: 'include' });
    if (!resp.ok) throw new Error(`Não consegui baixar de novo o original (HTTP ${resp.status}).`);
    return {
      data: await resp.arrayBuffer(),
      filename: params.get('name') || 'documento',
      kind: params.get('kind') as Kind | null,
      mime: resp.headers.get('content-type') || 'application/octet-stream',
      url: src,
    };
  }
  return null;
}

function setupDownload(entry: ViewEntry) {
  const a = $<HTMLAnchorElement>('#download');
  a.href = URL.createObjectURL(new Blob([entry.data], { type: entry.mime || 'application/octet-stream' }));
  a.download = entry.filename;
  a.hidden = false;
  if (entry.url) {
    const o = $<HTMLAnchorElement>('#original');
    o.href = entry.url;
    o.hidden = false;
  }
}

async function renderDocument(entry: ViewEntry) {
  const root = $('#content');
  disposeDocument?.();
  disposeDocument = null;
  root.replaceChildren();
  root.style.removeProperty('--z');
  delete document.body.dataset.pptxRenders;
  document.title = entry.filename;
  $('#filename').textContent = entry.filename;
  setupDownload(entry);
  setState('loading');

  let kind: Kind | null;
  try {
    kind = (await sniffKind(entry.data)) ?? entry.kind;
  } catch {
    throw new Error('O arquivo não é um documento Office válido (.docx, .pptx ou .xlsx). Formatos antigos (.doc, .ppt, .xls) não são suportados.');
  }
  root.className = `kind-${kind}`;
  resetZoom();

  if (kind === 'docx') {
    await renderDocx(entry.data, root, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      useBase64URL: false,
    });
    zoomTarget = { scroller: () => root, apply: (z) => root.style.setProperty('--z', String(z)) };
  } else if (kind === 'pptx') {
    // O zoom é CSS numa caixa por fora do renderer: pedir zoom ao renderer refaz
    // todos os slides (flash branco a cada passo). O host tem largura fixa em px
    // para o renderer não reajustar os slides quando o zoom muda; só a janela muda.
    const box = document.createElement('div');
    box.className = 'pptx-zoom';
    const host = document.createElement('div');
    host.className = 'pptx-host';
    box.append(host);
    root.append(box);
    const fit = () => (host.style.width = `${Math.max(200, root.clientWidth - 32)}px`);
    fit();
    const viewer = await PptxViewer.open(entry.data, host, {
      scrollContainer: root,
      zipLimits: RECOMMENDED_ZIP_LIMITS,
      pdfjs: false,
      externalMedia: 'block', // não faz requisição para mídia externa referenciada no arquivo
      fitMode: 'contain',
      lazySlides: true,
      lazyMedia: true,
      listOptions: { windowed: true, showSlideLabels: true },
      // contado para o teste e2e: cada render a mais é um flash branco
      onRenderStart: () => {
        document.body.dataset.pptxRenders = String(Number(document.body.dataset.pptxRenders ?? 0) + 1);
      },
    });
    const resize = new ResizeObserver(fit);
    resize.observe(root);
    disposeDocument = () => {
      resize.disconnect();
      viewer.destroy();
    };
    zoomTarget = { scroller: () => root, apply: (z) => root.style.setProperty('--z', String(z)) };
  } else if (kind === 'xlsx') {
    renderXlsx(entry.data, root);
    const sheet = root.querySelector<HTMLElement>('.sheet')!;
    zoomTarget = { scroller: () => sheet, apply: (z) => sheet.style.setProperty('--z', String(z)) };
  } else {
    throw new Error(`Tipo de documento não suportado: ${kind ?? 'desconhecido'}.`);
  }
  setState('ready', { kind });
}

function renderXlsx(data: ArrayBuffer, root: HTMLElement) {
  const wb = XLSX.read(data, { type: 'array' });
  const tabs = document.createElement('nav');
  tabs.className = 'sheet-tabs';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const show = (name: string, btn: HTMLButtonElement) => {
    // sheet_to_html escapa o conteúdo das células; o CSP da extensão bloqueia scripts de qualquer forma
    sheet.innerHTML = XLSX.utils.sheet_to_html(wb.Sheets[name]!, { header: '', footer: '' });
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  };
  wb.SheetNames.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.onclick = () => show(name, btn);
    tabs.append(btn);
    if (i === 0) queueMicrotask(() => show(name, btn));
  });
  root.append(sheet, tabs);
}

// ---------- zoom (Ctrl+scroll, pinça, Ctrl +/-/0) ----------
// Os eventos chegam mais rápido do que o pptx re-renderiza: guarda só o zoom
// desejado e aplica o último quando o anterior terminar.

let disposeDocument: (() => void) | null = null;

type ZoomTarget = { scroller: () => HTMLElement; apply: (z: number) => unknown };
let zoomTarget: ZoomTarget | null = null;
let appliedZoom = 1;
let wantedZoom = 1;
let zoomAnchor: { x: number; y: number } | null = null;
let zoomBusy = false;

function resetZoom() {
  zoomTarget = null;
  appliedZoom = wantedZoom = 1;
  updateZoomLabel();
}

function updateZoomLabel() {
  $('#zoom-reset').textContent = `${Math.round(wantedZoom * 100)}%`;
}

function requestZoom(z: number, anchor: { x: number; y: number } | null = null) {
  if (!zoomTarget) return;
  wantedZoom = clampZoom(z);
  zoomAnchor = anchor;
  updateZoomLabel();
  if (!zoomBusy) void pumpZoom();
}

async function pumpZoom() {
  zoomBusy = true;
  try {
    while (zoomTarget && wantedZoom !== appliedZoom) {
      const target = zoomTarget;
      const next = wantedZoom;
      const el = target.scroller();
      const rect = el.getBoundingClientRect();
      const cx = zoomAnchor ? zoomAnchor.x - rect.left : el.clientWidth / 2;
      const cy = zoomAnchor ? zoomAnchor.y - rect.top : el.clientHeight / 2;
      const ratio = next / appliedZoom;
      const left = el.scrollLeft;
      const top = el.scrollTop;
      await target.apply(next);
      if (target !== zoomTarget) return; // trocou de documento no meio
      appliedZoom = next;
      el.scrollLeft = anchoredScroll(left, cx, ratio);
      el.scrollTop = anchoredScroll(top, cy, ratio);
    }
  } catch (err) {
    console.error('zoom', err);
  } finally {
    zoomBusy = false;
    document.body.dataset.zoom = appliedZoom.toFixed(4);
  }
}

function setupZoom() {
  // passive: false para poder impedir o zoom do navegador
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !zoomTarget) return;
    e.preventDefault();
    requestZoom(zoomFromWheel(wantedZoom, wheelDeltaPx(e)), { x: e.clientX, y: e.clientY });
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !zoomTarget) return;
    if (e.key === '+' || e.key === '=') requestZoom(zoomStep(wantedZoom, 1));
    else if (e.key === '-' || e.key === '_') requestZoom(zoomStep(wantedZoom, -1));
    else if (e.key === '0') requestZoom(1);
    else return;
    e.preventDefault();
  });
  $('#zoom-in').onclick = () => requestZoom(zoomStep(wantedZoom, 1));
  $('#zoom-out').onclick = () => requestZoom(zoomStep(wantedZoom, -1));
  $('#zoom-reset').onclick = () => requestZoom(1);
}

function showError(err: unknown) {
  console.error(err);
  resetZoom();
  setState('error');
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = err instanceof Error ? err.message : String(err);
  $('#content').replaceChildren(p);
}

async function openFile(file: File) {
  try {
    await renderDocument({
      data: await file.arrayBuffer(),
      filename: file.name,
      kind: null,
      mime: file.type,
      url: null,
    });
  } catch (err) {
    showError(err);
  }
}

function setupDrop() {
  setState('empty');
  $<HTMLInputElement>('#picker').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) openFile(file);
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) openFile(file);
  });
}

async function main() {
  setupDrop();
  setupZoom();
  try {
    const entry = await loadFromParams();
    if (entry) await renderDocument(entry);
  } catch (err) {
    showError(err);
  }
}

main();
