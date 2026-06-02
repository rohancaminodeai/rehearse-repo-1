import { AuthCard } from "@/components/auth/auth-card";
import { CustomerLoginForm } from "@/components/auth/customer-login-form";

interface PortalLoginPageProps {
  // Next 15: route params are async.
  params: Promise<{ slug: string }>;
}

export default async function PortalLoginPage({ params }: PortalLoginPageProps) {
  const { slug } = await params;

  return (
    <AuthCard
      brand="InBody Portal"
      title="View your results"
      description="Log in with the name and password your trainer gave you."
    >
      <CustomerLoginForm slug={slug} />
    </AuthCard>
  );
}
