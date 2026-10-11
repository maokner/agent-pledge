/* eslint-disable @next/next/no-img-element -- photos and screenshots come from the API server, not this app */
import type { Subtask } from "@agent-pledge/shared";
import { Countdown } from "@/components/ui/Countdown";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { Money } from "@/components/ui/Money";
import { WorkStatusBadge } from "@/components/ui/StatusBadge";

/** One sub-task: status, claim link, Yik Yak screenshot, helper photo and PIN attempts. */
export function SubtaskCard({ subtask }: { subtask: Subtask }) {
  const active = subtask.status === "open" || subtask.status === "claimed";
  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">
          Sub-task: {subtask.description}, <Money amount={subtask.price} />
        </h3>
        <WorkStatusBadge status={subtask.status} />
      </header>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-300">
        <div>
          <dt className="inline">Claim link: </dt>
          <dd className="inline font-mono">/c/{subtask.claim_code}</dd>
        </div>
        {active && (
          <div>
            <dt className="inline">Time left: </dt>
            <dd className="inline">
              <Countdown deadline={subtask.deadline_at} />
            </dd>
          </div>
        )}
        {subtask.nft_id && (
          <div>
            <dt className="inline">Sub-task NFT: </dt>
            <dd className="inline">
              <ExplorerLink nft={subtask.nft_id} />
            </dd>
          </div>
        )}
        {subtask.helper_address && (
          <div>
            <dt className="inline">Helper: </dt>
            <dd className="inline">
              <ExplorerLink account={subtask.helper_address} />
            </dd>
          </div>
        )}
        {subtask.status === "claimed" && (
          <div>
            <dt className="inline">PIN tries left: </dt>
            <dd className="inline">{subtask.pin_locked ? "Locked" : subtask.pin_attempts_left}</dd>
          </div>
        )}
      </dl>

      {(subtask.yikyak_post || subtask.photo) && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {subtask.yikyak_post && (
            <figure>
              <img src={subtask.yikyak_post.screenshot_url} alt="Screenshot of the Yik Yak post" className="w-full rounded border border-zinc-200 dark:border-zinc-700" />
              <figcaption className="mt-1 text-sm">{subtask.yikyak_post.text}</figcaption>
            </figure>
          )}
          {subtask.photo && (
            <figure>
              <img src={subtask.photo.url} alt="The helper's photo of the saved seat" className="w-full rounded border border-zinc-200 dark:border-zinc-700" />
              {subtask.photo.note && <figcaption className="mt-1 text-sm font-medium">Seat saved: {subtask.photo.note}</figcaption>}
            </figure>
          )}
        </div>
      )}
    </section>
  );
}
