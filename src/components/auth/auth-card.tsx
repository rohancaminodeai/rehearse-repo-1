import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description?: string;
  /** Optional small brand line above the title (navy). */
  brand?: string;
  children: React.ReactNode;
}

/**
 * Centered auth shell used by every auth screen. Navy/emerald palette,
 * responsive down to 360px (NFR-6).
 */
export function AuthCard({ title, description, brand, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {brand ? (
            <p className="text-sm font-semibold text-slate-900">{brand}</p>
          ) : null}
          <CardTitle className="text-emerald-700">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
