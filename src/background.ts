// Intercepta respostas de documentos Office e abre no viewer da extensão.
//
// Fluxo: onHeadersReceived detecta o documento -> filterResponseData captura os
// bytes da resposta original (sem baixar de novo, então funciona com login, POST
// e links de uso único) -> os headers viram text/html sem "attachment", para o
// Firefox não abrir o diálogo de download -> no fim, a aba vai para o viewer.

import { detect, header, type Detected } from './detect.ts';
import { escapeHtml, t } from './i18n.ts';

export type Entry = Detected & { data: ArrayBuffer; url: string | null };

const MAX_BYTES = 200 * 1024 * 1024; // acima disso, deixa o Firefox baixar normalmente
const MAX_ENTRIES = 8; // documentos mantidos em memória (recarregar a aba do viewer)

const store = new Map<string, Entry>();
// URLs que o usuário pediu para baixar sem o viewer (arquivo grande demais)
const bypass = new Set<string>();

function remember(id: string, entry: Entry) {
  store.set(id, entry);
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value!);
}

function viewerUrl(id: string, info: Detected, url: string) {
  const q = new URLSearchParams({ id, kind: info.kind, name: info.filename, src: url });
  return browser.runtime.getURL(`viewer.html?${q}`);
}

// Página provisória que o Firefox mostra enquanto o arquivo chega
const enc = new TextEncoder();
const page = (html: string) =>
  enc.encode(`<!doctype html><meta charset="utf-8"><title>OmniViewer</title><p style="font:16px system-ui;margin:2em">${html}</p>`);

function onHeadersReceived(
  details: browser.webRequest._OnHeadersReceivedDetails,
): browser.webRequest.BlockingResponse | undefined {
  if (!details.responseHeaders) return;
  if (details.statusCode !== 200) return;
  if (bypass.delete(details.url)) return;
  const info = detect(details.url, details.responseHeaders);
  if (!info) return;
  const length = Number(header(details.responseHeaders, 'content-length'));
  if (length > MAX_BYTES) return;

  const id = crypto.randomUUID();
  const filter = browser.webRequest.filterResponseData(details.requestId);
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  let failed = false;

  filter.onstart = () => filter.write(page(escapeHtml(t('opening'))));
  filter.ondata = (e: { data: ArrayBuffer }) => {
    size += e.data.byteLength;
    if (size > MAX_BYTES) failed = true;
    if (!failed) chunks.push(e.data);
  };
  filter.onstop = async () => {
    if (failed) {
      bypass.add(details.url);
      filter.write(page(`${escapeHtml(t('tooLarge'))} <a href="${escapeHtml(details.url)}">${escapeHtml(t('downloadNormally'))}</a>`));
      filter.close();
      return;
    }
    filter.close();
    const data = await new Blob(chunks).arrayBuffer();
    remember(id, { data, ...info, url: details.url });
    const url = viewerUrl(id, info, details.url);
    if (details.type === 'main_frame' && details.tabId >= 0) {
      await browser.tabs.update(details.tabId, { url, loadReplace: true });
    } else {
      // download disparado por iframe (comum em webmail): abre ao lado
      await browser.tabs.create({ url, openerTabId: details.tabId >= 0 ? details.tabId : undefined });
    }
  };
  filter.onerror = () => console.error('omni-viewer: falha no filtro', filter.error, details.url);

  const responseHeaders = details.responseHeaders.filter((h) => {
    const n = h.name.toLowerCase();
    // content-encoding fica: o Firefox decodifica antes do filtro
    return n !== 'content-type' && n !== 'content-disposition' && n !== 'content-length';
  });
  responseHeaders.push({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
  return { responseHeaders };
}

browser.webRequest.onHeadersReceived.addListener(
  onHeadersReceived,
  { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame'] },
  ['blocking', 'responseHeaders'],
);

browser.runtime.onMessage.addListener((msg: any) => {
  if (msg?.type === 'get') return Promise.resolve(store.get(msg.id) ?? null);
});

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL('viewer.html') });
});
