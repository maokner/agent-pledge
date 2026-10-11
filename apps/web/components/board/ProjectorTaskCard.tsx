import { MAX_PIN_ATTEMPTS, type Subtask } from "@agent-pledge/shared";
import { Countdown } from "@/components/ui/Countdown";
import { Money } from "@/components/ui/Money";
import { ZoomableImage } from "@/components/ui/ZoomableImage";
import { selectPartyNames, subtaskHolder, type TaskView } from "@/lib/board/selectors";
import { formatRlusd } from "@/lib/format";
import { FAILURE_REASON_LABEL } from "@/lib/labels";
import { LiveStatusBadge, StatusGlow } from "./LiveStatus";
import { MoneyTree } from "./MoneyTree";
import { WORK_STATUS_STYLE } from "./status-style";
import { TxList } from "./TxList";

/**
 * The big card in projector mode (#43): one task, its newest sub-task, the
 * money tree, the transactions, the Yik Yak screenshot and the seat photo,
 * sized to fit a 16:9 screen with no scrolling. The status, the amounts and
 * the PIN tries left are the largest text on the screen.
 */
export function ProjectorTaskCard({ view }: { view: TaskView }) {
  const { task, subtasks } = view;
  const subtask = subtasks.at(-1) ?? null;
  const active = task.status === "open" || task.status === "claimed";

  return (
    <article
      aria-label={`Task: ${task.description}`}
      className={`relative flex flex-col gap-3 rounded-xl border-2 border-l-[1rem] border-zinc-400 p-4 lg:min-h-0 lg:flex-1 ${WORK_STATUS_STYLE[task.status].card}`}
    >
      <StatusGlow status={task.status} />
      <header className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-4xl leading-tight font-extrabold">{task.description}</h2>
          <p className="text-2xl text-zinc-800">{task.place}</p>
        </div>
        <BigFact label="Time left">
          {active ? <Countdown deadline={task.deadline_at} /> : <span className="text-zinc-700">Finished</span>}
        </BigFact>
        <BigFact label="Requester pays">
          <Money amount={task.price} />
        </BigFact>
        <LiveStatusBadge status={task.status} size="xl" />
      </header>

      {task.status === "failed" && (
        <p role="status" className="rounded-lg bg-rose-700 px-4 py-2 text-2xl font-bold text-white">
          Failed{task.failure_reason ? `: ${FAILURE_REASON_LABEL[task.failure_reason]}.` : "."} The requester gets{" "}
          {formatRlusd(task.price)} back plus the agent&apos;s {formatRlusd(task.pledge)} pledge.
        </p>
      )}

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="lg:min-h-0 lg:overflow-y-auto">
          <MoneyTree view={view} />
        </div>
        <div className="flex flex-col gap-3 lg:min-h-0">
          {subtask ? (
            <SubtaskPanel subtask={subtask} earlier={subtasks.length - 1} />
          ) : (
            <Waiting>{task.status === "open" ? "Waiting for the local agent to claim the task…" : "No sub-task yet."}</Waiting>
          )}
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <TxList txs={view.txs} names={selectPartyNames(view)} title="Transactions" compactRows={3} />
          </div>
        </div>
        <Media subtask={subtask} />
      </div>
    </article>
  );
}

function BigFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <p className="text-lg font-bold tracking-wide text-zinc-700 uppercase">{label}</p>
      <p className="text-5xl leading-none font-extrabold tabular-nums">{children}</p>
    </div>
  );
}

function SubtaskPanel({ subtask, earlier }: { subtask: Subtask; earlier: number }) {
  const active = subtask.status === "open" || subtask.status === "claimed";
  return (
    <section
      aria-label={`Sub-task: ${subtask.description}`}
      className={`relative shrink-0 rounded-lg border-2 border-l-[0.75rem] border-zinc-400 p-3 ${WORK_STATUS_STYLE[subtask.status].card}`}
    >
      <StatusGlow status={subtask.status} />
      <p className="text-lg font-bold tracking-wide text-zinc-700 uppercase">
        Sub-task for a helper{earlier > 0 ? ` (posted again, ${earlier} earlier)` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-5xl font-extrabold">
          <Money amount={subtask.price} />
        </span>
        <LiveStatusBadge status={subtask.status} size="xl" />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="PIN tries left">
          <PinTries subtask={subtask} />
        </Fact>
        <Fact label="Time left">
          {active ? <Countdown deadline={subtask.deadline_at} className="text-4xl font-extrabold" /> : <span className="text-zinc-700">Finished</span>}
        </Fact>
        <Fact label="Held by">{subtaskHolder(subtask)}</Fact>
        <Fact label="Claim link">
          <a href={subtask.claim_url} className="font-mono underline decoration-2 underline-offset-4" target="_blank" rel="noopener noreferrer">
            /c/{subtask.claim_code}
          </a>
        </Fact>
      </dl>
      {subtask.status === "failed" && subtask.failure_reason && (
        <p className="mt-2 rounded-md bg-rose-700 px-3 py-1 text-xl font-bold text-white">{FAILURE_REASON_LABEL[subtask.failure_reason]}</p>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-base font-bold tracking-wide text-zinc-700 uppercase">{label}</dt>
      <dd className="text-2xl font-semibold">{children}</dd>
    </div>
  );
}

/** "2 of 3" in big type, "Locked" after three wrong PINs, "Correct" once paid (PRD R8). */
function PinTries({ subtask }: { subtask: Subtask }) {
  if (subtask.pin_locked) return <span className="text-4xl font-extrabold text-rose-700">Locked</span>;
  if (subtask.status === "done") return <span className="text-4xl font-extrabold text-emerald-800">Correct</span>;
  const left = subtask.pin_attempts_left;
  return (
    <span className={`text-4xl font-extrabold tabular-nums ${left < MAX_PIN_ATTEMPTS ? "text-rose-700" : ""}`}>
      {left} <span className="text-2xl font-bold">of {MAX_PIN_ATTEMPTS}</span>
    </span>
  );
}

/** The Yik Yak screenshot (step 9) and the helper's photo (step 11), each shrunk to fit the column. */
function Media({ subtask }: { subtask: Subtask | null }) {
  const post = subtask?.yikyak_post ?? null;
  const photo = subtask?.photo ?? null;
  return (
    <div className="flex flex-col gap-3 lg:min-h-0">
      <Figure title="The Yik Yak post">
        {post ? (
          <ZoomableImage key={post.screenshot_url} src={post.screenshot_url} alt={`Screenshot of the Yik Yak post: ${post.text}`} fit className="motion-safe:animate-fade-in" />
        ) : (
          <Waiting>{subtask?.status === "open" ? "Waiting for the Yik Yak post…" : "No post yet."}</Waiting>
        )}
      </Figure>
      <Figure title="The helper's photo" caption={photo ? `Seat saved${photo.note ? `: ${photo.note}` : ""}` : undefined}>
        {photo ? (
          <ZoomableImage
            key={photo.url}
            src={photo.url}
            alt={photo.note ? `The saved seat: ${photo.note}` : "The helper's photo of the saved seat"}
            fit
            className="motion-safe:animate-fade-in"
          />
        ) : (
          <Waiting>{subtask?.status === "claimed" ? "Waiting for the helper's photo…" : "No photo yet."}</Waiting>
        )}
      </Figure>
    </div>
  );
}

function Figure({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col lg:min-h-0 lg:flex-1">
      <figcaption className="mb-1 text-xl font-bold text-zinc-800">{title}</figcaption>
      <div className="h-64 lg:h-auto lg:min-h-0 lg:flex-1">{children}</div>
      {caption && <p className="mt-1 text-2xl font-extrabold">{caption}</p>}
    </figure>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-full min-h-20 items-center justify-center rounded-lg border-2 border-dashed border-zinc-500 p-3 text-center text-xl text-zinc-700">
      {children}
    </p>
  );
}
