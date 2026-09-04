export const MAIN_CONTENT_ID = 'main'

// O botão que abriu o diálogo acabou de sair da tela (a linha desmontou, o
// status mudou): sem um alvo vivo o foco cairia no `<body>` e o teclado
// recomeçaria do topo do documento.
export function returnFocusToContent(): void {
  document.getElementById(MAIN_CONTENT_ID)?.focus()
}
