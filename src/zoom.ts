// Matemática do zoom (pura, testada em test/zoom.test.ts).
//
// Ctrl+scroll e pinça no touchpad chegam como WheelEvent com ctrlKey: a roda
// dá passos grandes (~3 linhas), a pinça dá vários deltas pequenos em pixels.
// Um fator exponencial trata os dois igual: zoom é proporcional ao quanto mexeu.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4; // limite do renderer de pptx
const SENSITIVITY = 0.0025; // um passo de roda (48px) ≈ 13%
const STEP = 1.2; // Ctrl + / Ctrl -

const LINE_PX = 16;
const PAGE_PX = 800;

export function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** deltaY em pixels, qualquer que seja o deltaMode (0 px, 1 linha, 2 página). */
export function wheelDeltaPx(e: { deltaY: number; deltaMode: number }) {
  return e.deltaY * (e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1);
}

/** Roda para cima (deltaY negativo) aproxima. */
export function zoomFromWheel(current: number, deltaPx: number) {
  return clampZoom(current * Math.exp(-deltaPx * SENSITIVITY));
}

export function zoomStep(current: number, dir: 1 | -1) {
  return clampZoom(dir > 0 ? current * STEP : current / STEP);
}

/**
 * Nova posição de scroll para o ponto sob o cursor continuar no mesmo lugar
 * depois que o conteúdo escalou por `ratio`. `cursor` é relativo à área visível.
 */
export function anchoredScroll(scroll: number, cursor: number, ratio: number) {
  return Math.max(0, (scroll + cursor) * ratio - cursor);
}
