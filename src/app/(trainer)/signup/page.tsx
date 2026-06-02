import { AuthCard } from "@/components/auth/auth-card";
import { TrainerSignupForm } from "@/components/auth/trainer-signup-form";

export default function TrainerSignupPage() {
  return (
    <AuthCard
      brand="InBody Dashboard"
      title="Create your account"
      description="Start organizing your customers' InBody results."
    >
      <TrainerSignupForm />
    </AuthCard>
  );
}
