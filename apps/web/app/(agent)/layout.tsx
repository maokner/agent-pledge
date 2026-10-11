/** Agent surface: turns on the --color-term-* tokens (docs/design/agent-design-system.md). */
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="agent" className="min-h-dvh bg-term-bg font-mono text-term-fg">
      {children}
    </div>
  );
}
