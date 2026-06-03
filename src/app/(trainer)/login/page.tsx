import { AuthCard } from "@/components/auth/auth-card";
import { TrainerLoginForm } from "@/components/auth/trainer-login-form";

export default function TrainerLoginPage() {
  return (
    <AuthCard
      brand="InBody Dashboard"
      title="Welcome back"
      description="Log in to manage your customers and groups."
    >
      <TrainerLoginForm />
    </AuthCard>
  );
}
