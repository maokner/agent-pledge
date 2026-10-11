/** Landing surface: turns on the --color-landing-* tokens (docs/design/DIRECTION.md). */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="landing" className="min-h-dvh bg-landing-bg font-sans text-landing-fg">
      {children}
    </div>
  );
}
