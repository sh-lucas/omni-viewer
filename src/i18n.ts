// Textos da interface: src/_locales/<idioma>/messages.json (inglês é o padrão).
export function t(key: string, ...subs: string[]) {
  return browser.i18n.getMessage(key, subs) || key;
}

/** Preenche elementos marcados com data-i18n (texto), data-i18n-title e data-i18n-aria. */
export function localizePage(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle!);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria!));
  document.documentElement.lang = browser.i18n.getUILanguage();
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
