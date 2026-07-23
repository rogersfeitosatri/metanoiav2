import { PanelShell } from "@/components/PanelShell";

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelShell role="professional" title="Painel profissional">
      {children}
    </PanelShell>
  );
}
