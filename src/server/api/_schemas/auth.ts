import { z } from "zod";

// Trainer sign-up: email + password + name (FR-1).
export const trainerSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

// Trainer sign-in (FR-1).
export const trainerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Customer sign-in (FR-4). The trainer slug comes from the route path, NOT the body.
export const customerLoginSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(1),
});
