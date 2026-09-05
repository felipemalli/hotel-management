const CSRF_COOKIE = 'csrftoken'

export const CSRF_HEADER = 'X-CSRFToken'

export function csrfToken(): string | null {
  const match = new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`).exec(document.cookie)
  const value = match?.[1]
  return value === undefined || value === '' ? null : decodeURIComponent(value)
}

export function csrfHeaders(): Record<string, string> {
  const token = csrfToken()
  return token === null ? {} : { [CSRF_HEADER]: token }
}
