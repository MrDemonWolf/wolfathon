"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "@wolfathon/ui/lib/utils";

/**
 * Styled confirm dialog (Base UI AlertDialog). Use for destructive actions that
 * need an explicit, focus-trapped, keyboard-dismissable confirmation — a styled
 * replacement for `window.confirm`. Compose Trigger/Close around the app's
 * `Button` via Base UI's `render` prop.
 */
function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
	return <AlertDialogPrimitive.Root {...props} />;
}

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
	return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogClose(props: AlertDialogPrimitive.Close.Props) {
	return <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />;
}

function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.Popup.Props) {
	return (
		<AlertDialogPrimitive.Portal>
			<AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm duration-150 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0" />
			<AlertDialogPrimitive.Popup
				data-slot="alert-dialog-content"
				className={cn(
					"fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl outline-none duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
					className,
				)}
				{...props}
			/>
		</AlertDialogPrimitive.Portal>
	);
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
	return (
		<AlertDialogPrimitive.Title
			className={cn("font-heading text-lg font-bold", className)}
			{...props}
		/>
	);
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
	return (
		<AlertDialogPrimitive.Description
			className={cn("mt-1.5 text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("mt-5 flex justify-end gap-2", className)} {...props} />;
}

export {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
};
