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
  sheetImgs: number;
  sheets: Record<string, string>;
  download: { name: string; sha: string } | null;
};

async function sha256(url: string) {
  const buf = await (await fetch(url)).arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
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
    sheetImgs: document.querySelectorAll('.sheet img').length,
    sheets,
    download: a.hidden ? null : { name: a.download, sha: await sha256(a.href) },
  };
  await fetch(endpoint, { method: 'POST', body: JSON.stringify(r) });
}
