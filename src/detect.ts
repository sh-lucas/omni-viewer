// Decide, a partir da URL e dos headers de uma resposta HTTP, se ela é um
// documento Office que o viewer sabe abrir. Funções puras: testadas em test/detect.test.js.

export type Kind = 'docx' | 'pptx' | 'xlsx';
export type Header = { name: string; value?: string };
export type Detected = { kind: Kind; filename: string; mime: string };

const MIME_KINDS: Record<string, Kind> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-word.document.macroenabled.12': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': 'pptx',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12': 'pptx',
  'application/vnd.ms-powerpoint.slideshow.macroenabled.12': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'xlsx',
};

const EXT_KINDS: Record<string, Kind> = {
  docx: 'docx', docm: 'docx',
  pptx: 'pptx', pptm: 'pptx', ppsx: 'pptx', ppsm: 'pptx',
  xlsx: 'xlsx', xlsm: 'xlsx',
};

// Servidores mandam o tipo errado com frequência; nesses casos vale o nome do arquivo.
const GENERIC_MIMES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/force-download',
  'application/download',
  'application/x-download',
  'application/unknown',
]);

export function header(headers: Header[], name: string): string {
  const h = headers.find((x) => x.name.toLowerCase() === name);
  return h ? h.value ?? '' : '';
}

export function filenameFromDisposition(value: string): string | null {
  if (!value) return null;
  // RFC 5987: filename*=UTF-8''nome%20codificado tem prioridade
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(value);
  if (star) {
    try {
      return decodeURIComponent(star[2]!.trim().replace(/^"|"$/g, ''));
    } catch { /* cai para filename= */ }
  }
  const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(value);
  if (quoted) return quoted[1]!.replace(/\\(.)/g, '$1');
  const bare = /filename\s*=\s*([^;]+)/i.exec(value);
  if (bare) return bare[1]!.trim();
  return null;
}

export function filenameFromUrl(url: string): string | null {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

export function kindFromFilename(name: string | null): Kind | null {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? EXT_KINDS[m[1]!.toLowerCase()] ?? null : null;
}

export function detect(url: string, responseHeaders: Header[]): Detected | null {
  const mime = header(responseHeaders, 'content-type').split(';')[0]!.trim().toLowerCase();
  const disposition = header(responseHeaders, 'content-disposition');
  const named = filenameFromDisposition(disposition) || filenameFromUrl(url);

  let kind: Kind | null = MIME_KINDS[mime] ?? null;
  if (!kind && GENERIC_MIMES.has(mime)) kind = kindFromFilename(named);
  if (!kind) return null;

  let filename = named || 'document';
  if (!kindFromFilename(filename)) filename += `.${kind}`;
  return { kind, filename, mime: mime || 'application/octet-stream' };
}
