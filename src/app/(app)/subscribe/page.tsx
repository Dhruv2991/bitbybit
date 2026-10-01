"use client";
import SubscribePage from "@/components/pages/SubscribePage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user } = useAppShell();
  return <SubscribePage user={user} />;
}
