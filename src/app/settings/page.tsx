import type { Metadata } from "next";

import { getProfile } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { LANGUAGE_LABELS, type Language } from "@/lib/types";

import { LanguageForm } from "./language-form";

import { BackButton } from "@/components/back-button";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const profile = await getProfile(user.id);
  const current: Language = profile?.preferredLanguage ?? "en";

  return (
    <div className="mx-auto max-w-2xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise relative">
        <div className="absolute -left-12 top-0 hidden md:block">
          <BackButton />
        </div>
        <p className="t-micro mb-6 flex items-center gap-3">
          <span className="md:hidden"><BackButton /></span>
          Settings
        </p>
        <h1 className="t-display">
          Preferences
        </h1>
      </header>

      <section className="rise mt-12" style={{ animationDelay: "80ms" }}>
        <LanguageForm
          current={current}
          labels={LANGUAGE_LABELS}
        />
      </section>
    </div>
  );
}
