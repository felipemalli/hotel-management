export const MAIN_CONTENT_ID = 'main'

// `finalFocus` quando o botão que abriu já desmontou.
export function focusMainContent(): HTMLElement | null {
  return document.getElementById(MAIN_CONTENT_ID)
}
