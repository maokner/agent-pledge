import { MAX_PIN_ATTEMPTS, type Subtask } from "@/lib/contract";
import { taskTag } from "@/lib/board/agent-log";
import { selectPartyNames, subtaskHolder, type TaskView } from "@/lib/board/selectors";
import { cn } from "@/lib/cn";
import { formatRlusd } from "@/lib/format";
import { failureText } from "@/lib/labels";
import { MoneyTree } from "./MoneyTree";
import { GLOW, LINK, WORK_BORDER } from "./term-style";
import { Countdown, Money, Pane, SectionTitle, TimeLeft, Waiting, WorkStatusTag, ZoomableImage } from "./term";
import { TxList } from "./TxList";

/**
 * The big window in projector mode (#43): one task, its newest sub-task, the
 * money tree, the transactions, the Yik Yak screenshot and the seat photo,
 * sized to fit a 16:9 screen with no scrolling. The status, the amounts and
 * the PIN tries left are the largest text on the screen.
 */
export function ProjectorTaskCard({ view, arrived = false }: { view: TaskView; arrived?: boolean }) {
  const { task, subtasks } = view;
  const subtask = subtasks.at(-1) ?? null;
  const active = task.status === "open" || task.status === "claimed";

  return (
    <Pane
      aria-label={`Task: ${task.description}`}
      title={`Task ${taskTag(task.id)}`}
      flash={arrived}
      className={cn("text-lg lg:min-h-0 lg:flex-1", WORK_BORDER[task.status])}
      bodyClassName="gap-3 lg:min-h-0 lg:flex-1"
      right={<WorkStatusTag status={task.status} size="2xl" />}
    >
      <header className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className={cn("text-4xl leading-tight font-bold", GLOW)}>
            <span aria-hidden className="text-term-fg-dim">
              &gt;{" "}
            </span>
            {task.description}
          </p>
          <p className="text-2xl text-term-fg-dim">@ {task.place}</p>
        </div>
        <BigFact label="Time left">
          {active ? (
            <TimeLeft deadline={task.deadline_at} limitMinutes={task.time_limit_minutes} barClassName="text-lg" />
          ) : (
            <span className="text-term-fg-dim">Finished</span>
          )}
        </BigFact>
        <BigFact label="Requester pays">
          <Money amount={task.price} />
        </BigFact>
      </header>

      {task.status === "failed" && (
        <p role="status" className="border border-term-red px-3 py-1 text-2xl font-bold text-term-red">
          [ERR] FAILED{failureText(task) ? `: ${failureText(task)}.` : "."}{" "}
          <span className="text-term-amber">
            <span aria-hidden>↩ </span>The requester gets {formatRlusd(task.price)} back plus the agent&apos;s {formatRlusd(task.pledge)}{" "}
            pledge.
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="relative lg:min-h-0 lg:overflow-y-auto">
          <MoneyTree view={view} />
        </div>
        <div className="flex flex-col gap-3 lg:min-h-0">
          {subtask ? (
            <SubtaskPanel subtask={subtask} earlier={subtasks.length - 1} />
          ) : (
            <Waiting className="text-lg">{task.status === "open" ? "Waiting for the local agent to claim the task" : "No sub-task yet"}</Waiting>
          )}
          <div className="relative lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <TxList txs={view.txs} names={selectPartyNames(view)} title="Transactions" compactRows={3} />
          </div>
        </div>
        <Media subtask={subtask} />
      </div>
    </Pane>
  );
}

function BigFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <p className="text-base font-bold tracking-wide text-term-fg-dim uppercase">{label}</p>
      <p className={cn("text-4xl leading-none font-bold tabular-nums", GLOW)}>{children}</p>
    </div>
  );
}

function SubtaskPanel({ subtask, earlier }: { subtask: Subtask; earlier: number }) {
  const active = subtask.status === "open" || subtask.status === "claimed";
  return (
    <section aria-label={`Sub-task: ${subtask.description}`} className={cn("shrink-0 border p-3", WORK_BORDER[subtask.status])}>
      <SectionTitle as="p" className="projector:text-lg">
        Sub-task for a helper{earlier > 0 ? ` (posted again, ${earlier} earlier)` : ""}
      </SectionTitle>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Money amount={subtask.price} className={cn("text-4xl font-bold", GLOW)} />
        <WorkStatusTag status={subtask.status} size="xl" />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="PIN tries left">
          <PinTries subtask={subtask} />
        </Fact>
        <Fact label="Time left">
          {active ? <Countdown deadline={subtask.deadline_at} className={cn("text-4xl font-bold", GLOW)} /> : <span className="text-term-fg-dim">Finished</span>}
        </Fact>
        <Fact label="Held by">{subtaskHolder(subtask)}</Fact>
        <Fact label="Claim link">
          <a href={subtask.claim_url} className={LINK} target="_blank" rel="noopener noreferrer">
            /c/{subtask.claim_code}
          </a>
        </Fact>
      </dl>
      {subtask.status === "failed" && failureText(subtask) && (
        <p className="mt-2 border border-term-red px-2 py-1 text-lg font-bold text-term-red">
          [ERR] {failureText(subtask)}
        </p>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-base font-bold tracking-wide text-term-fg-dim uppercase">{label}</dt>
      <dd className="text-2xl font-bold">{children}</dd>
    </div>
  );
}

/** "2 of 3" in big type, "[ERR] LOCKED" after three wrong PINs, "[OK] CORRECT" once paid (PRD R8). */
function PinTries({ subtask }: { subtask: Subtask }) {
  if (subtask.pin_locked) return <span className="text-4xl font-bold text-term-red">[ERR] LOCKED</span>;
  if (subtask.status === "done") return <span className={cn("text-4xl font-bold text-term-status-validated", GLOW)}>[OK] CORRECT</span>;
  const left = subtask.pin_attempts_left;
  return (
    <span className={cn("text-4xl font-bold tabular-nums", left < MAX_PIN_ATTEMPTS ? "text-term-red" : GLOW)}>
      {left} <span className="text-2xl">of {MAX_PIN_ATTEMPTS}</span>
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
          <ZoomableImage key={post.screenshot_url} src={post.screenshot_url} alt={`Screenshot of the Yik Yak post: ${post.text}`} fit />
        ) : (
          <Waiting className="h-full min-h-20 text-lg">{subtask?.status === "open" ? "Waiting for the Yik Yak post" : "No post yet"}</Waiting>
        )}
      </Figure>
      <Figure title="The helper's photo" caption={photo ? `[OK] Seat saved${photo.note ? `: ${photo.note}` : ""}` : undefined}>
        {photo ? (
          <ZoomableImage
            key={photo.url}
            src={photo.url}
            alt={photo.note ? `The saved seat: ${photo.note}` : "The helper's photo of the saved seat"}
            fit
          />
        ) : (
          <Waiting className="h-full min-h-20 text-lg">{subtask?.status === "claimed" ? "Waiting for the helper's photo" : "No photo yet"}</Waiting>
        )}
      </Figure>
    </div>
  );
}

function Figure({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col lg:min-h-0 lg:flex-1">
      <figcaption className="mb-1">
        <SectionTitle as="p" className="projector:text-lg">
          {title}
        </SectionTitle>
      </figcaption>
      <div className="h-64 lg:h-auto lg:min-h-0 lg:flex-1">{children}</div>
      {caption && <p className={cn("mt-1 text-2xl font-bold", GLOW)}>{caption}</p>}
    </figure>
  );
}
