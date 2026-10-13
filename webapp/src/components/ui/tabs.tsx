import * as React from "react"
import { cn } from "@/lib/utils"

interface TabsContextValue {
    value: string
    onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
    value: string
    onValueChange: (value: string) => void
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
    ({ value, onValueChange, className, ...props }, ref) => (
        <TabsContext.Provider value={{ value, onValueChange }}>
            <div ref={ref} className={cn("w-full", className)} {...props} />
        </TabsContext.Provider>
    )
)
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "flex items-center rounded-xl border border-white/10 bg-black/20 p-1",
                className
            )}
            {...props}
        />
    )
)
TabsList.displayName = "TabsList"

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
    ({ value, className, children, ...props }, ref) => {
        const ctx = React.useContext(TabsContext)
        const active = ctx?.value === value
        return (
            <button
                ref={ref}
                type="button"
                onClick={() => ctx?.onValueChange(value)}
                className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-all",
                    active ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200",
                    className
                )}
                {...props}
            >
                {children}
            </button>
        )
    }
)
TabsTrigger.displayName = "TabsTrigger"

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
    value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
    ({ value, className, children, ...props }, ref) => {
        const ctx = React.useContext(TabsContext)
        if (ctx?.value !== value) return null
        return (
            <div ref={ref} className={cn("mt-4", className)} {...props}>
                {children}
            </div>
        )
    }
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
