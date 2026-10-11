"use client";

import type { CreateTaskResponse, TaskId } from "@/lib/contract";
import { useRef, useState, type FormEvent } from "react";
import { getFixtureTransport } from "@/lib/board/get-transport";
import {
  BackupTaskError,
  submitBackupTask,
  type BackupTaskForm as FormValues,
} from "@/lib/backup-task/client";
import { validateBackupTask, type BackupTaskField } from "@/lib/backup-task/validate";
import { cn } from "@/lib/cn";
import { FIXTURE_MODE } from "@/lib/config";
import { GLOW, LINK } from "./term-style";
import { Cursor, TermButton, WrapLine } from "./term";

const PASSCODE_KEY = "agent-pledge:backup-passcode";

const EMPTY: FormValues = {
  description: "",
  place: "",
  time_limit_minutes: "",
  price_usd: "",
  caller_phone: "",
};

type Phase =
  | { kind: "editing"; errors: Partial<Record<BackupTaskField, string>>; message: string | null }
  | { kind: "sending" }
  | { kind: "created"; response: CreateTaskResponse };

/**
 * The backup for a failed phone call (PRD 11, #38): a small link that opens
 * a form with the voice agent's create_task fields. It posts to this app's
 * /api/backup-task route, which adds the voice secret on the server. Shows
 * the PIN, and says when the new task is on the board. Each field is a
 * shell prompt (`agent@pledge:~$`); the focused field's prompt inverts.
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
        message:
          error instanceof BackupTaskError
            ? error.message
            : "Could not reach the web server. Try again.",
      });
    }
  }

  const field = (name: BackupTaskField) => ({
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
    "aria-invalid": phase.kind === "editing" && Boolean(phase.errors[name]),
    "aria-describedby": `backup-${name}-error`,
    className: INPUT,
  });
  const errorFor = (name: BackupTaskField) => {
    const error = phase.kind === "editing" ? phase.errors[name] : null;
    return (
      <span id={`backup-${name}-error`} className="text-sm text-term-red">
        {error ? `[ERR] ${error}` : null}
      </span>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={cn(LINK, "text-sm text-term-fg-dim projector:text-base")}
      >
        &gt; Phone call failed? Create the task here
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="backup-title"
        onClose={close}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] border border-term-fg bg-term-bg p-0 font-mono text-term-fg backdrop:bg-term-bg/80"
      >
        <div className="flex items-center justify-between gap-3 bg-term-fg pl-3 text-term-bg">
          <h2 id="backup-title" className="font-bold tracking-wide uppercase">
            Create a task
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="min-h-11 px-3 font-bold outline-none hover:bg-term-bg hover:text-term-fg focus-visible:bg-term-bg focus-visible:text-term-fg"
          >
            [ X ]
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-term-fg-dim">
            # The same create_task call the voice agent makes.
          </p>

          {phase.kind === "created" ? (
            <Created
              response={phase.response}
              onBoard={isOnBoard(phase.response.task_id)}
              onDone={close}
            />
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-3">
              <Field
                label="What to do"
                input={
                  <input
                    {...field("description")}
                    placeholder="Save me a seat at the front table"
                    autoComplete="off"
                  />
                }
              >
                {errorFor("description")}
              </Field>
              <Field
                label="Where"
                input={
                  <input
                    {...field("place")}
                    placeholder="Main Stacks, front table"
                    autoComplete="off"
                  />
                }
              >
                {errorFor("place")}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Time limit (minutes)"
                  prompt="$"
                  input={
                    <input {...field("time_limit_minutes")} inputMode="numeric" placeholder="3" />
                  }
                >
                  {errorFor("time_limit_minutes")}
                </Field>
                <Field
                  label="Price (USD)"
                  prompt="$"
                  input={<input {...field("price_usd")} inputMode="decimal" placeholder="5" />}
                >
                  {errorFor("price_usd")}
                </Field>
              </div>
              <Field
                label="Requester phone (optional)"
                input={
                  <input
                    {...field("caller_phone")}
                    type="tel"
                    placeholder="+15105550123"
                    autoComplete="off"
                  />
                }
              >
                {errorFor("caller_phone")}
              </Field>
              <Field
                label="Operator passcode"
                input={
                  <input
                    name="passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    autoComplete="off"
                    className={INPUT}
                  />
                }
              >
                <span className="text-sm text-term-fg-dim">
                  {FIXTURE_MODE
                    ? "# Fixture mode: not needed unless BACKUP_FORM_PASSCODE is set."
                    : "# BACKUP_FORM_PASSCODE on the web server."}
                </span>
              </Field>

              {phase.kind === "editing" && phase.message && (
                <p role="alert" className="border border-term-red px-2 py-1 text-sm text-term-red">
                  [ERR] {phase.message}
                </p>
              )}
              <TermButton
                type="submit"
                variant="solid"
                size="base"
                disabled={phase.kind === "sending"}
                className="w-full"
              >
                {phase.kind === "sending" ? (
                  <>
                    [..] CREATING <Cursor />
                  </>
                ) : (
                  "[ CREATE TASK ]"
                )}
              </TermButton>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * A prompt-style field: a `# label` comment line, then the prompt and the
 * input with no box. The prompt inverts while its input has focus, and
 * turns red while the input is invalid.
 */
function Field({
  label,
  prompt = "agent@pledge:~$",
  input,
  children,
}: {
  label: string;
  prompt?: string;
  input: React.ReactNode;
  /** The field's error or hint, on its own line. */
  children?: React.ReactNode;
}) {
  return (
    <label className="group flex min-w-0 flex-col gap-0.5">
      <span className="text-sm text-term-fg-dim">
        <span aria-hidden># </span>
        {label}
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span
          aria-hidden
          className="shrink-0 px-0.5 text-term-fg-dim group-has-[[aria-invalid=true]]:text-term-red group-focus-within:bg-term-fg group-focus-within:text-term-bg"
        >
          {prompt}
        </span>
        {input}
      </span>
      {children}
    </label>
  );
}

function Created({
  response,
  onBoard,
  onDone,
}: {
  response: CreateTaskResponse;
  onBoard: boolean;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" role="status">
      <p className="text-sm">
        <span className="font-bold text-term-status-validated">[OK]</span> Task created. Give the
        requester this PIN:
      </p>
      <p
        className={cn("text-center text-4xl font-bold tracking-widest tabular-nums", GLOW)}
        data-testid="backup-pin"
      >
        {response.pin}
      </p>
      <div className="text-sm">
        <WrapLine text={response.task_id} width={28} className="text-term-fg-dim" />
        <p>
          {onBoard ? (
            <span className="font-bold text-term-status-validated">[OK] is on the board.</span>
          ) : (
            <span className="text-term-status-pending">
              [..] Waiting for it to appear on the board <Cursor />
            </span>
          )}
        </p>
      </div>
      <TermButton size="base" onClick={onDone} className="self-center">
        DONE
      </TermButton>
    </div>
  );
}

const INPUT =
  "min-w-0 flex-1 border-0 border-b border-dashed border-term-line bg-transparent p-0 text-base text-term-fg caret-term-fg outline-none [caret-shape:block] placeholder:text-term-fg-dim placeholder:italic focus:border-term-fg aria-[invalid=true]:border-term-red";

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
