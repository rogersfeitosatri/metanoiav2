import { PanelShell } from "@/components/PanelShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelShell role="admin" title="Administração">
      {children}
    </PanelShell>
  );
}
