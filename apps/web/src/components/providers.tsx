"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@wolfathon/ui/components/sonner";

import { queryClient } from "@/utils/trpc";

/**
 * Wolfathon ships one fixed dark brand theme (no theme switcher), so the only
 * provider we need is React Query. The Toaster is invisible until a toast fires,
 * so it's harmless on the transparent overlay route.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
