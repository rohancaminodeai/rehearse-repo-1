import { redirect } from "next/navigation";

import { CustomerPortal } from "@/components/customer-portal/customer-portal";
import { getCustomerSession } from "@/server/auth/session";
import { prisma } from "@/server/data/prisma";
import type { InbodyEntryDTO } from "@/shared/types";

interface PortalDashboardPageProps {
  // Next 15: route params are async.
  params: Promise<{ slug: string }>;
}

/**
 * Customer portal dashboard (server component — the real security gate, rule 5).
 *
 * The Edge middleware only confirms a valid `customer_session` cookie exists; it
 * cannot do the slug -> trainerId DB lookup. So this page MUST verify the URL
 * `[slug]` resolves to the trainer the session is bound to. Without it, a
 * customer of trainer A could open trainer B's portal URL (IDOR, rule 4).
 */
export default async function PortalDashboardPage({
  params,
}: PortalDashboardPageProps) {
  const { slug } = await params;

  const session = await getCustomerSession();
  if (!session) {
    redirect(`/portal/${slug}/login`);
  }

  // Slug <-> trainer binding (P0). The URL slug must belong to the trainer this
  // customer session is bound to.
  const trainer = await prisma.trainer.findUnique({ where: { slug } });
  if (!trainer || trainer.id !== session.trainerId) {
    redirect(`/portal/${slug}/login`);
  }

  // Stale session: the cookie is valid but the customer row no longer exists.
  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
  });
  if (!customer) {
    redirect(`/portal/${slug}/login`);
  }

  // Read this customer's OWN entries only (rule 4). objectKey is never exposed.
  const entries = await prisma.inbodyEntry.findMany({
    where: { customerId: session.customerId },
    include: { reaction: true },
    orderBy: { createdAt: "desc" },
  });

  const dtos: InbodyEntryDTO[] = entries.map((entry) => ({
    id: entry.id,
    originalFilename: entry.originalFilename,
    contentType: entry.contentType,
    comment: entry.comment,
    createdAt: entry.createdAt.toISOString(),
    reaction: entry.reaction
      ? {
          id: entry.reaction.id,
          emoji: entry.reaction.emoji,
          createdAt: entry.reaction.createdAt.toISOString(),
        }
      : null,
  }));

  return <CustomerPortal entries={dtos} customerName={customer.name} />;
}
