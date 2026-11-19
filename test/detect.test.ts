import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, filenameFromDisposition, type Header } from '../src/detect.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const h = (o: Record<string, string>): Header[] => Object.entries(o).map(([name, value]) => ({ name, value }));

test('MIME específico decide o tipo, mesmo sem extensão na URL', () => {
  assert.deepEqual(detect('https://x.com/download?id=1', h({ 'Content-Type': DOCX })), {
    kind: 'docx', filename: 'download.docx', mime: DOCX,
  });
  assert.equal(detect('https://x.com/a', h({ 'content-type': `${PPTX}; charset=binary` }))?.kind, 'pptx');
  assert.equal(detect('https://x.com/a', h({ 'CONTENT-TYPE': XLSX }))?.kind, 'xlsx');
});

test('MIME genérico usa o nome do Content-Disposition, que vence a URL', () => {
  const r = detect('https://x.com/file.bin', h({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="Relatório Final.pptx"',
  }));
  assert.deepEqual(r, { kind: 'pptx', filename: 'Relatório Final.pptx', mime: 'application/octet-stream' });
});

test('MIME genérico usa a URL quando não há Content-Disposition', () => {
  assert.equal(detect('https://x.com/docs/plan%20a.xlsx?v=2', h({ 'Content-Type': 'application/zip' }))?.filename, 'plan a.xlsx');
  assert.equal(detect('https://x.com/docs/a.docm', h({}))?.kind, 'docx'); // sem Content-Type
});

test('não intercepta o que não é OOXML', () => {
  assert.equal(detect('https://x.com/a.docx', h({ 'Content-Type': 'text/html' })), null); // página de erro/login
  assert.equal(detect('https://x.com/a.pdf', h({ 'Content-Type': 'application/octet-stream' })), null);
  assert.equal(detect('https://x.com/a.doc', h({ 'Content-Type': 'application/msword' })), null); // binário legado
  assert.equal(detect('https://x.com/a.ppt', h({ 'Content-Type': 'application/octet-stream' })), null);
  assert.equal(detect('https://x.com/', h({ 'Content-Type': 'application/octet-stream' })), null);
});

test('Content-Disposition: filename* (RFC 5987) tem prioridade e é decodificado', () => {
  assert.equal(filenameFromDisposition(`attachment; filename="fallback.docx"; filename*=UTF-8''A%C3%A7%C3%A3o.docx`), 'Ação.docx');
  assert.equal(filenameFromDisposition('attachment; filename=plain.xlsx'), 'plain.xlsx');
  assert.equal(filenameFromDisposition('attachment; filename="a \\"b\\".pptx"'), 'a "b".pptx');
  assert.equal(filenameFromDisposition('attachment'), null);
  assert.equal(filenameFromDisposition(`attachment; filename*=UTF-8''%E0%A4%A; filename="ok.docx"`), 'ok.docx'); // % inválido
});
