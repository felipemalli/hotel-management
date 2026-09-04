export const MAIN_CONTENT_ID = 'main'

// O botão que abriu o diálogo pode ter saído da tela quando ele fecha (a
// linha desmontou, o status mudou): `finalFocus` cai aqui em vez de deixar o
// foco no `<body>`, que recomeçaria o teclado do topo do documento. `null`
// quando a página não tem `<main id="main">` (ex.: componente testado
// isolado) faz o Dialog cair no próprio comportamento padrão.
export function focusMainContent(): HTMLElement | null {
  return document.getElementById(MAIN_CONTENT_ID)
}
