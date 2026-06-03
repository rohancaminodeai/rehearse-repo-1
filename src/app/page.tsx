import { redirect } from "next/navigation";

import { getTrainerSession } from "@/server/auth/session";

/**
 * Root entry point. Trainers are the only role that self-serves a login here
 * (customers reach their portal via a per-slug link), so we route to the trainer
 * surface: dashboard when signed in, login otherwise. No blank/scaffold landing
 * (CLAUDE.md §16 — every screen is sensible).
 */
export default async function Home() {
  const session = await getTrainerSession();
  redirect(session ? "/dashboard" : "/login");
}
