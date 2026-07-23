import { cn } from "@/lib/utils"

/** `bg-muted` (`--color-surface-container-low`, #fff0ef) is a 1%-off-white
 *  tint of the app's white Card background — invisible as a loading
 *  indicator there. `bg-surface-container-high` gives real, visible
 *  contrast against both the white Card surface and the cream page
 *  background while staying inside the existing warm palette (no new color
 *  introduced). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-surface-container-high", className)}
      {...props}
    />
  )
}

export { Skeleton }
