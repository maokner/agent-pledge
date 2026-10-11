import { FIXTURE_MODE } from "@/lib/config";

/** Shows "Fixture data" when NEXT_PUBLIC_FIXTURES=1, so nobody mistakes it for live data. */
export function FixtureBadge() {
  if (!FIXTURE_MODE) return null;
  return (
    <span className="rounded bg-fuchsia-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
      Fixture data
    </span>
  );
}
