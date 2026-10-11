/** Human surface: turns on the --color-human-* tokens (docs/design/human-design-system.md). */
export default function HumanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="human" className="min-h-dvh bg-human-bg font-sans text-human-fg">
      {children}
    </div>
  );
}
