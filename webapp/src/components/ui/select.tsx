import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = React.forwardRef<
    HTMLSelectElement,
    React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
    <div className="relative">
        <select
            className={cn(
                "flex h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 disabled:cursor-not-allowed disabled:opacity-50 appearance-none",
                className
            )}
            ref={ref}
            title={props.title || "Selection dropdown"}
            aria-label={props["aria-label"] || props.title || "Selection dropdown"}
            {...props}
        >
            {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
    </div>
))
Select.displayName = "Select"

const SelectGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
const SelectValue = ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>
const SelectTrigger = ({ children, className }: { children: React.ReactNode, className?: string }) => <div className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)}>{children}</div>
const SelectContent = ({ children }: { children: React.ReactNode }) => <div className="relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-80">{children}</div>
const SelectLabel = ({ children }: { children: React.ReactNode }) => <div className="py-1.5 pl-8 pr-2 text-sm font-semibold">{children}</div>
const SelectItem = ({ children, value }: { children: React.ReactNode, value: string }) => <option value={value}>{children}</option>
const SelectSeparator = () => <div className="-mx-1 my-1 h-px bg-muted" />

export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
}
