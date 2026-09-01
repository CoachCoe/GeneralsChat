import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-strong disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "btn-primary",
        destructive: "btn-primary bg-[var(--destructive)] hover:bg-[#ff5a50] active:bg-[#ff3b30]",
        outline: "btn-secondary",
        secondary: "btn-secondary",
        ghost: "btn-ghost",
        link: "text-[var(--primary)] underline-offset-4 hover:underline min-h-[var(--touch-target)] px-5",
      },
      size: {
        default: "min-h-[var(--touch-target)] px-6",
        sm: "min-h-[36px] px-4 text-[15px]",
        lg: "min-h-[52px] px-8 text-[17px]",
        icon: "h-[var(--touch-target)] w-[var(--touch-target)] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
