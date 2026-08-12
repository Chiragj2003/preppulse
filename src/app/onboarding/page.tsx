import type { Metadata } from "next";
import { getProfile } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Complete Your Profile" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const profile = await getProfile(user.id);

  return (
    <div className="mx-auto max-w-xl px-5 pt-28 pb-24 sm:px-6">
      <div className="text-center mb-8">
        <p className="t-micro mb-3">PrepPulse Onboarding</p>
        <h1 className="t-title">Set Up Your Profile</h1>
        <p className="t-lead mt-3 text-ink-3">
          Configure your unique username handle and details before accessing your practice dashboard.
        </p>
      </div>

      <OnboardingForm
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
        }}
        initialUsername={profile?.username ?? ""}
        initialAge={profile?.age ?? 22}
        initialSkills={profile?.skillsDescription ?? ""}
        initialLanguage={profile?.preferredLanguage ?? "en"}
      />
    </div>
  );
}
