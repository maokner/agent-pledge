import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BoardPreview } from "@/components/board/BoardPreview";
import { FIXTURE_MODE } from "@/lib/config";
import { PREVIEW_LAYOUTS, type PreviewLayout } from "@/lib/fixtures/preview";

/** Fixture mode only: /preview?layout=one|three|stops shows static board layouts to check the cards (#32). */
export default function PreviewPage({ searchParams }: PageProps<"/preview">) {
  if (!FIXTURE_MODE) notFound();
  return (
    <Suspense fallback={<p className="p-4 text-term-fg-dim">&gt; LOADING…</p>}>
      {searchParams.then(({ layout }) => (
        <BoardPreview layout={toLayout(layout)} />
      ))}
    </Suspense>
  );
}

function toLayout(value: string | string[] | undefined): PreviewLayout {
  return typeof value === "string" && value in PREVIEW_LAYOUTS ? (value as PreviewLayout) : "one";
}
