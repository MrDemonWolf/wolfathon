import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@wolfathon/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-[0.6rem] border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none active:scale-[0.98] focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_4px_14px_-5px_rgba(0,172,237,0.6)] hover:brightness-110 [a]:hover:bg-primary/80",
				outline:
					"border-[var(--glass-stroke)] bg-[rgba(18,34,71,0.5)] shadow-[inset_0_1px_0_var(--glass-edge)] backdrop-blur-md hover:bg-[rgba(18,34,71,0.75)] hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
				secondary:
					"border-[var(--glass-stroke)] bg-secondary/70 text-secondary-foreground shadow-[inset_0_1px_0_var(--glass-edge)] backdrop-blur-md hover:bg-secondary aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default:
					"h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				xs: "h-6 gap-1 rounded-[0.55rem] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 rounded-[0.55rem] px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				icon: "size-8",
				"icon-xs": "size-6 rounded-[0.5rem] [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7 rounded-[0.55rem]",
				"icon-lg": "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
