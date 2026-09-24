import { useEffect, useState } from 'react'

/**
 * Two routes is not worth a routing dependency: the app renders from
 * `location.pathname` and pushes history entries directly.
 */

/** Current pathname, re-rendered on back/forward. */
export function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  return path
}

export function navigate(to: string): void {
  window.history.pushState(null, '', to)
  // pushState does not fire popstate, so tell the listener about it ourselves.
  window.dispatchEvent(new PopStateEvent('popstate'))
}
