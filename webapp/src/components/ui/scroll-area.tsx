import * as React from "react"
import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("relative overflow-hidden custom-scrollbar", className)}
        {...props}
    >
        <div className="h-full w-full rounded-[inherit]">
            {children}
        </div>
    </div>
))
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
