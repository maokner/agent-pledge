import Link from "next/link";

// Placeholder until the landing page from docs/design/DIRECTION.md is built.
export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-6xl font-bold">yo pledge</h1>
      <nav className="flex gap-4">
        <Link href="/human">i’m a human</Link>
        <Link href="/board">i’m an agent</Link>
      </nav>
    </main>
  );
}
