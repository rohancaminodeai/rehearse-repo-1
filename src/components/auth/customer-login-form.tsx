"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { customerLoginSchema } from "@/server/api/_schemas/auth";
import type { CustomerDTO } from "@/shared/types";

import { FormField } from "./form-field";
import { postJson } from "./post-json";

type FieldErrors = Partial<Record<"name" | "password", string>>;

interface CustomerLoginFormProps {
  /** Trainer slug from the route path; sent as a query param, not in the body. */
  slug: string;
}

export function CustomerLoginForm({ slug }: CustomerLoginFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const parsed = customerLoginSchema.safeParse({ name, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "name" || key === "password") {
          next[key] ??= issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});

    setPending(true);
    try {
      const result = await postJson<CustomerDTO>(
        `/api/auth/customer/login?slug=${encodeURIComponent(slug)}`,
        parsed.data,
      );
      if (result.ok) {
        router.push(`/portal/${slug}/dashboard`);
        return;
      }
      // Generic copy — never reveal which field was wrong.
      setFormError(result.error?.message ?? "Invalid name or password.");
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="name"
        label="Name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
        error={fieldErrors.name}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
        error={fieldErrors.password}
      />

      {formError ? (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
