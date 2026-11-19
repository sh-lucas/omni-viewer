# Omni Viewer

Extensão para Firefox (e derivados, como o Zen) que abre `.docx`, `.pptx` e `.xlsx`
direto no navegador, do mesmo jeito que o leitor de PDF: clicou no link, o documento
abre numa aba, com um botão para baixar o arquivo original.

- Tudo roda localmente: o documento não é enviado para nenhum serviço.
- Usa os bytes da própria resposta do site (sem baixar de novo), então funciona em
  páginas com login, downloads via POST e links de uso único (ex.: Moodle, webmail).
- Zoom com Ctrl+scroll, pinça no touchpad e Ctrl `+`/`-`/`0`.
- Arquivos locais: clique no ícone da extensão e arraste o arquivo para a página.

Renderização: [docx-preview](https://github.com/VolodymyrBaydalka/docxjs),
[@aiden0z/pptx-renderer](https://github.com/aiden0z/pptx-renderer) e
[SheetJS](https://sheetjs.com/). Formatos binários antigos (`.doc`, `.ppt`, `.xls`)
não são suportados.

## Como funciona

`src/background.ts` observa as respostas HTTP (`webRequest.onHeadersReceived`). Quando
uma delas é um documento OOXML (pelo `Content-Type` ou pelo nome do arquivo),
`webRequest.filterResponseData` captura os bytes e a aba é levada para `viewer.html`,
que renderiza o documento. `filterResponseData` só existe no Firefox, por isso a
extensão não tem versão para Chrome.

## Build

Requisitos: Node.js 20+ e pnpm.

```sh
pnpm install
pnpm build          # gera dist/ (extensão descompactada)
npx web-ext build -s dist -a artifacts   # empacota em artifacts/
```

O `dist/` é gerado pelo esbuild a partir de `src/` (bundle sem minificação).

## Testes

```sh
pnpm typecheck
pnpm test           # unitários (detecção de tipo, zoom)
pnpm test:e2e       # Firefox headless + servidor local; precisa de firefox e geckodriver no PATH
```

O e2e cobre: MIME correto, `Content-Disposition: attachment` com nome UTF-8, gzip,
rota com cookie (sem baixar duas vezes), POST, `target=_blank`, download por iframe,
arquivo inválido, página HTML comum não interceptada, e zoom (escala, âncora no cursor,
sem redesenhar o documento).
