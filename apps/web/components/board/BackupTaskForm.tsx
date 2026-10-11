"use client";

import type { CreateTaskResponse, TaskId } from "@agent-pledge/shared";
import { useRef, useState, type FormEvent } from "react";
import { getFixtureTransport } from "@/lib/board/get-transport";
import { BackupTaskError, submitBackupTask, type BackupTaskForm as FormValues } from "@/lib/backup-task/client";
import { validateBackupTask, type BackupTaskField } from "@/lib/backup-task/validate";
import { FIXTURE_MODE } from "@/lib/config";

const PASSCODE_KEY = "agent-pledge:backup-passcode";

const EMPTY: FormValues = { description: "", place: "", time_limit_minutes: "", price_usd: "", caller_phone: "" };

type Phase =
  | { kind: "editing"; errors: Partial<Record<BackupTaskField, string>>; message: string | null }
  | { kind: "sending" }
  | { kind: "created"; response: CreateTaskResponse };

/**
 * The backup for a failed phone call (PRD 11, #38): a small link that opens
 * a form with the voice agent's create_task fields. It posts to this app's
 * /api/backup-task route, which adds the voice secret on the server. Shows
 * the PIN, and says when the new task is on the board.
 */
export function BackupTaskForm({ isOnBoard }: { isOnBoard: (taskId: TaskId) => boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [passcode, setPasscode] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "editing", errors: {}, message: null });

  function open() {
    setPasscode((current) => current || readPasscode());
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
    if (phase.kind === "created") {
      setValues(EMPTY);
      setPhase({ kind: "editing", errors: {}, message: null });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validateBackupTask(values);
    if (!checked.ok) return setPhase({ kind: "editing", errors: checked.errors, message: null });

    setPhase({ kind: "sending" });
    try {
      const response = await submitBackupTask(values, passcode);
      savePasscode(passcode);
      // Fixture mode has no server to broadcast task.created; the simulated stream does it.
      getFixtureTransport()?.createTask({ ...checked.value, task_id: response.task_id });
      setPhase({ kind: "created", response });
    } catch (error) {
      setPhase({
        kind: "editing",
        errors: error instanceof BackupTaskError ? error.fields : {},
        message: error instanceof BackupTaskError ? error.message : "Could not reach the web server. Try again.",
      });
    }
  }

  const field = (name: BackupTaskField) => ({
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
    "aria-invalid": phase.kind === "editing" && Boolean(phase.errors[name]),
    "aria-describedby": `backup-${name}-error`,
    className: INPUT,
  });
  const errorFor = (name: BackupTaskField) => (
    <span id={`backup-${name}-error`} className="text-xs text-rose-700 dark:text-rose-300">
      {phase.kind === "editing" ? phase.errors[name] : null}
    </span>
  );

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="text-xs text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        Phone call failed? Create the task here
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="backup-title"
        onClose={close}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        <div className="flex flex-col gap-4 p-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 id="backup-title" className="text-xl font-semibold">
                Create a task
              </h2>
              <p className="text-sm text-zinc-500">The same create_task call the voice agent makes.</p>
            </div>
            <button type="button" onClick={close} className="rounded px-2 text-xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
              ×
            </button>
          </header>

          {phase.kind === "created" ? (
            <Created response={phase.response} onBoard={isOnBoard(phase.response.task_id)} onDone={close} />
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-3">
              <label className={LABEL}>
                What to do
                <input {...field("description")} placeholder="Save me a seat at the front table" autoComplete="off" />
                {errorFor("description")}
              </label>
              <label className={LABEL}>
                Where
                <input {...field("place")} placeholder="Main Stacks, front table" autoComplete="off" />
                {errorFor("place")}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={LABEL}>
                  Time limit (minutes)
                  <input {...field("time_limit_minutes")} inputMode="numeric" placeholder="3" />
                  {errorFor("time_limit_minutes")}
                </label>
                <label className={LABEL}>
                  Price (USD)
                  <input {...field("price_usd")} inputMode="decimal" placeholder="5" />
                  {errorFor("price_usd")}
                </label>
              </div>
              <label className={LABEL}>
                Requester phone (optional)
                <input {...field("caller_phone")} type="tel" placeholder="+15105550123" autoComplete="off" />
                {errorFor("caller_phone")}
              </label>
              <label className={LABEL}>
                Operator passcode
                <input
                  name="passcode"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  autoComplete="off"
                  className={INPUT}
                />
                <span className="text-xs text-zinc-500">
                  {FIXTURE_MODE
                    ? "Fixture mode: not needed unless BACKUP_FORM_PASSCODE is set."
                    : "BACKUP_FORM_PASSCODE on the web server."}
                </span>
              </label>

              {phase.kind === "editing" && phase.message && (
                <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                  {phase.message}
                </p>
              )}
              <button
                type="submit"
                disabled={phase.kind === "sending"}
                className="rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {phase.kind === "sending" ? "Creating…" : "Create task"}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

function Created({ response, onBoard, onDone }: { response: CreateTaskResponse; onBoard: boolean; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3" role="status">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Task created. Give the requester this PIN:</p>
      <p className="text-center font-mono text-5xl font-bold tracking-[0.3em]" data-testid="backup-pin">
        {response.pin}
      </p>
      <p className="text-sm">
        <span className="font-mono text-xs text-zinc-500">{response.task_id}</span>{" "}
        {onBoard ? (
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">is on the board.</span>
        ) : (
          <span className="text-zinc-500">Waiting for it to appear on the board…</span>
        )}
      </p>
      <button type="button" onClick={onDone} className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
        Done
      </button>
    </div>
  );
}

const LABEL = "flex flex-col gap-1 text-sm font-medium";
const INPUT =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base font-normal aria-[invalid=true]:border-rose-500 dark:border-zinc-600 dark:bg-zinc-950";

function readPasscode(): string {
  try {
    return sessionStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePasscode(passcode: string): void {
  try {
    if (passcode) sessionStorage.setItem(PASSCODE_KEY, passcode);
  } catch {
    // Private mode or storage blocked: the operator types it again next time.
  }
}
