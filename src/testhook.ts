import { zoomFromWheel } from './zoom.ts';

// Só entra no build de teste (OMNI_TEST_REPORT definido no build.mjs).
// O WebDriver do Firefox não inspeciona páginas moz-extension://, então o
// viewer manda um retrato do que renderizou para o servidor do teste e2e.

export type Report = {
  href: string;
  state: string;
  kind: string | null;
  title: string;
  text: string;
  docxPages: number;
  pptxSlides: number;
  pptxRenders: number; // quantas vezes o renderer de pptx desenhou tudo (até o fim do probe)
  sheetImgs: number;
  sheets: Record<string, string>;
  download: { name: string; sha: string } | null;
  zoom: ZoomProbe | null;
};

export type ZoomProbe = {
  expected: number; // zoom que 3 passos de Ctrl+roda devem dar
  applied: number; // body[data-zoom] depois de aplicar
  sizeRatio: number; // largura do conteúdo depois / antes
  defaultPrevented: boolean; // o navegador não fez o zoom dele junto
  anchorBefore: number; // ponto do conteúdo sob o cursor (y), antes
  anchorAfter: number; // o mesmo ponto, depois, dividido pelo zoom
  resetRatio: number; // largura depois de Ctrl+0 / largura original
  sameNodes: boolean; // o conteúdo não foi redesenhado (sem flash)
  refit: { width: number; expected: number } | null; // pptx: reajuste ao estreitar a janela
};

async function sha256(url: string) {
  const buf = await (await fetch(url)).arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

async function waitZoom(value: number) {
  for (let i = 0; i < 200 && Math.abs(Number(document.body.dataset.zoom ?? 1) - value) > 1e-3; i++) await frame();
  await frame();
}

// Simula Ctrl+roda (3 passos para cima) no meio da área visível e mede o efeito.
async function probeZoom(): Promise<ZoomProbe | null> {
  const kind = document.body.dataset.kind;
  const sel = kind === 'docx' ? 'section.docx' : kind === 'pptx' ? '[data-slide-index]' : kind === 'xlsx' ? '.sheet table' : null;
  const scroller = kind === 'xlsx' ? document.querySelector<HTMLElement>('.sheet') : document.querySelector<HTMLElement>('#content');
  if (!sel || !scroller) return null;
  const width = () => document.querySelector(sel)!.getBoundingClientRect().width;
  const first = document.querySelector(sel)!;
  const w0 = width();
  const rect = scroller.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const anchorBefore = scroller.scrollTop + (y - rect.top);

  let defaultPrevented = true;
  for (let i = 0; i < 3; i++) {
    const ev = new WheelEvent('wheel', { ctrlKey: true, deltaY: -3, deltaMode: 1, clientX: x, clientY: y, bubbles: true, cancelable: true });
    scroller.dispatchEvent(ev);
    defaultPrevented &&= ev.defaultPrevented;
  }
  const expected = [48, 48, 48].reduce((z) => zoomFromWheel(z, -48), 1);
  await waitZoom(expected);
  const applied = Number(document.body.dataset.zoom);
  const sizeRatio = width() / w0;
  const anchorAfter = (scroller.scrollTop + (y - rect.top)) / applied;
  const sameNodes = first.isConnected && document.querySelector(sel) === first;

  window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, cancelable: true }));
  await waitZoom(1);
  const resetRatio = width() / w0;

  let refit: ZoomProbe['refit'] = null;
  if (kind === 'pptx') {
    // estreita a área do viewer: os slides devem se reajustar à nova largura
    scroller.style.flex = 'none';
    scroller.style.width = '700px';
    for (let i = 0; i < 60 && Math.abs(width() - w0) < 1; i++) await frame();
    refit = { width: width(), expected: scroller.clientWidth - 32 };
    scroller.style.flex = scroller.style.width = '';
  }
  return { expected, applied, sizeRatio, defaultPrevented, anchorBefore, anchorAfter, resetRatio, sameNodes, refit };
}

export async function report(endpoint: string) {
  // percorre as abas da planilha para o teste ver o conteúdo de cada uma
  const sheets: Record<string, string> = {};
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.sheet-tabs button')) {
    btn.click();
    sheets[btn.textContent!] = document.querySelector<HTMLElement>('.sheet')!.innerText;
  }
  document.querySelector<HTMLButtonElement>('.sheet-tabs button')?.click();

  const a = document.querySelector<HTMLAnchorElement>('#download')!;
  const r: Report = {
    href: location.href,
    state: document.body.dataset.state!,
    kind: document.body.dataset.kind ?? null,
    title: document.title,
    text: document.body.innerText,
    docxPages: document.querySelectorAll('section.docx').length,
    pptxSlides: document.querySelectorAll('[data-slide-index]').length,
    pptxRenders: 0,
    sheetImgs: document.querySelectorAll('.sheet img').length,
    sheets,
    download: a.hidden ? null : { name: a.download, sha: await sha256(a.href) },
    zoom: document.body.dataset.state === 'ready' ? await probeZoom() : null,
  };
  r.pptxRenders = Number(document.body.dataset.pptxRenders ?? 0);
  await fetch(endpoint, { method: 'POST', body: JSON.stringify(r) });
}
