import { AppShellProvider } from "@/components/layout/AppShellContext";
import { LoungeAudioProvider } from "@/components/lounge/LoungeAudioContext";
import AppShell from "@/components/layout/AppShell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShellProvider>
      <LoungeAudioProvider>
        <AppShell>{children}</AppShell>
      </LoungeAudioProvider>
    </AppShellProvider>
  );
}
