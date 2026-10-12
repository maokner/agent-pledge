/**
 * Demo surface (/demo): the recorded run, for judges. It uses the human
 * design tokens (light, Inter, electric blue), but it is not a Helper page:
 * it names the ledger, the NFTs and the wallets on purpose, because that is
 * what it is there to show (docs/design/DIRECTION.md, "Demo").
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="human" className="min-h-dvh bg-human-bg font-sans text-human-fg">
      {children}
    </div>
  );
}
