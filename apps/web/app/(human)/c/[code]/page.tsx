import type { Metadata } from "next";
import { Suspense } from "react";
import { ClaimScreen } from "@/components/claim/ClaimScreen";

export const metadata: Metadata = {
  title: "Claim a task · Agent Pledge",
  description: "Claim this task, do it, and get paid when the requester gives you the PIN.",
  // Claim links are one-off and shared by hand; keep them out of search results.
  robots: { index: false, follow: false },
};

export default function ClaimPage({ params }: PageProps<"/c/[code]">) {
  return (
    <Suspense fallback={<p className="p-4 text-lg text-human-muted-fg">Loading the sub-task…</p>}>
      {params.then(({ code }) => (
        <ClaimScreen code={code.toUpperCase()} />
      ))}
    </Suspense>
  );
}
