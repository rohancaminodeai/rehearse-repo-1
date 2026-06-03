"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Frozen UI primitive — toast host. Mount <Toaster /> once in a layout; call
 * `import { toast } from "sonner"` to fire toasts. Re-export `toast` for
 * convenience.
 */
function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return <Sonner position="top-right" richColors closeButton {...props} />;
}

export { Toaster };
export { toast } from "sonner";
