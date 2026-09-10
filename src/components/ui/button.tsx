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
        // Not red. This is used for "Delete policy" and "Clear conversation",
        // which are destructive but are not deadline states -- and a red
        // button next to a red overdue countdown competes with the only signal
        // the UI is allowed to raise its voice with. The word on the button
        // says what it does.
        destructive: "btn-secondary",
        outline: "btn-secondary",
        secondary: "btn-secondary",
        ghost: "btn-ghost",
        link: "text-[var(--color-text)] underline-offset-4 hover:underline min-h-[44px] px-5",
      },
      size: {
        default: "min-h-[44px] px-6",
        sm: "min-h-[36px] px-4 text-[15px]",
        lg: "min-h-[52px] px-8 text-[17px]",
        icon: "h-[44px] w-[44px] p-0",
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
