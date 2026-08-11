import type { Metadata } from "next";

import { getProfile } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { LANGUAGE_LABELS, type Language } from "@/lib/types";

import { LanguageForm } from "./language-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const profile = await getProfile(user.id);
  const current: Language = profile?.preferredLanguage ?? "en";

  return (
    <div className="mx-auto max-w-2xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">Settings</p>
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
