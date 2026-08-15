"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingChat } from "@/components/chat/OnboardingChat";
import { useStore } from "@/lib/store";

export default function OnboardingPage() {
  const store = useStore();
  const router = useRouter();

  useEffect(() => {
    if (store.ready && !store.currentProfile) router.replace("/");
    if (store.currentProfile?.onboarding_completed) router.replace("/app/hoje");
  }, [router, store.currentProfile, store.ready]);

  if (!store.ready || !store.currentProfile) return null;
  return <OnboardingChat />;
}
