import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchoredScroll, clampZoom, MAX_ZOOM, MIN_ZOOM, wheelDeltaPx, zoomFromWheel, zoomStep } from '../src/zoom.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('deltaMode é normalizado para pixels', () => {
  assert.equal(wheelDeltaPx({ deltaY: 3, deltaMode: 1 }), 48);
  assert.equal(wheelDeltaPx({ deltaY: -2, deltaMode: 0 }), -2);
  assert.equal(wheelDeltaPx({ deltaY: 1, deltaMode: 2 }), 800);
});

test('roda para cima aproxima, para baixo afasta, e os dois se desfazem', () => {
  const up = zoomFromWheel(1, -48);
  assert.ok(up > 1.1 && up < 1.2, `um passo de roda deveria dar ~13%, deu ${up}`);
  assert.ok(zoomFromWheel(1, 48) < 1);
  close(zoomFromWheel(zoomFromWheel(1, -48), 48), 1);
});

test('pinça (muitos deltas pequenos) chega no mesmo zoom que um delta grande', () => {
  let z = 1;
  for (let i = 0; i < 24; i++) z = zoomFromWheel(z, -2);
  close(z, zoomFromWheel(1, -48));
});

test('zoom fica entre os limites', () => {
  assert.equal(zoomFromWheel(1, -100000), MAX_ZOOM);
  assert.equal(zoomFromWheel(1, 100000), MIN_ZOOM);
  assert.equal(clampZoom(0), MIN_ZOOM);
  assert.equal(zoomStep(MAX_ZOOM, 1), MAX_ZOOM);
  close(zoomStep(zoomStep(1, 1), -1), 1);
});

test('scroll ancorado mantém o ponto sob o cursor', () => {
  // ponto do conteúdo sob o cursor: scroll + cursor = 300; após 2x vira 600
  assert.equal(anchoredScroll(200, 100, 2), 500); // 500 + 100 = 600
  assert.equal(anchoredScroll(0, 0, 3), 0);
  assert.equal(anchoredScroll(0, 100, 0.5), 0); // não fica negativo
});
