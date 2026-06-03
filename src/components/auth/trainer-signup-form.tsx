"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { trainerSignupSchema } from "@/server/api/_schemas/auth";
import type { TrainerDTO } from "@/shared/types";

import { FormField } from "./form-field";
import { postJson } from "./post-json";

type FieldErrors = Partial<Record<"email" | "name" | "password", string>>;

export function TrainerSignupForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const parsed = trainerSignupSchema.safeParse({ email, name, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "name" || key === "password") {
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
        "/api/auth/trainer/signup",
        parsed.data,
      );
      if (result.ok) {
        router.push("/dashboard");
        return;
      }
      setFormError(result.error?.message ?? "Sign up failed.");
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
        autoComplete="new-password"
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
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
