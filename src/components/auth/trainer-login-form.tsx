"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { trainerLoginSchema } from "@/server/api/_schemas/auth";
import type { TrainerDTO } from "@/shared/types";

import { FormField } from "./form-field";
import { postJson } from "./post-json";

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function TrainerLoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const parsed = trainerLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") {
          next[key] ??= issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});

    setPending(true);
    try {
      const result = await postJson<TrainerDTO>(
        "/api/auth/trainer/login",
        parsed.data,
      );
      if (result.ok) {
        router.push("/dashboard");
        return;
      }
      // Generic copy — never reveal which field was wrong.
      setFormError(result.error?.message ?? "Invalid email or password.");
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
        error={fieldErrors.email}
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

      <p className="text-center text-sm text-slate-500">
        Need an account?{" "}
        <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
