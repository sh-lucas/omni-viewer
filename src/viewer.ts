import { renderAsync as renderDocx } from 'docx-preview';
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { Entry } from './background.ts';
import type { Kind } from './detect.ts';

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
  root.replaceChildren();
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

  if (kind === 'docx') {
    await renderDocx(entry.data, root, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      useBase64URL: false,
    });
  } else if (kind === 'pptx') {
    await PptxViewer.open(entry.data, root, {
      zipLimits: RECOMMENDED_ZIP_LIMITS,
      pdfjs: false,
      externalMedia: 'block', // não faz requisição para mídia externa referenciada no arquivo
      fitMode: 'contain',
      lazySlides: true,
      lazyMedia: true,
      listOptions: { windowed: true, showSlideLabels: true },
    });
  } else if (kind === 'xlsx') {
    renderXlsx(entry.data, root);
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

function showError(err: unknown) {
  console.error(err);
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
  try {
    const entry = await loadFromParams();
    if (entry) await renderDocument(entry);
  } catch (err) {
    showError(err);
  }
}

main();
