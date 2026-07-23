import * as React from "react"

// Matches this app's existing `lg:` (1024px) desktop-chrome breakpoint
// convention (see src/components/app/top-app-bar.tsx's `hidden lg:flex`) —
// shadcn's own default is 768px, which would otherwise leave the sidebar and
// the rest of the app's desktop/mobile chrome disagreeing between 768-1024px.
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
