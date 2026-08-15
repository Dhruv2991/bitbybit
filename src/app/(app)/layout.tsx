import { AppShellProvider } from "@/components/layout/AppShellContext";
import AppShell from "@/components/layout/AppShell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShellProvider>
      <AppShell>{children}</AppShell>
    </AppShellProvider>
  );
}
