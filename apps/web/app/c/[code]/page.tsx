import { Suspense } from "react";
import { ClaimScreen } from "@/components/claim/ClaimScreen";

export default function ClaimPage({ params }: PageProps<"/c/[code]">) {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      {params.then(({ code }) => (
        <ClaimScreen code={code.toUpperCase()} />
      ))}
    </Suspense>
  );
}
