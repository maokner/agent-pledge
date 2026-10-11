/** Parses the transcript format described in transcripts/README.md. */

export type TranscriptEvent =
  | { kind: "agent" | "caller"; text: string }
  | { kind: "tool_call"; name: string; args: unknown }
  | { kind: "tool_result"; status: number; body: unknown };

export function parseTranscript(markdown: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  const lines = markdown.split("\n");
  let pending:
    { kind: "tool_call"; name: string } | { kind: "tool_result"; status: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const turn = /^\*\*(Agent|Caller):\*\* (.+)$/.exec(line);
    if (turn) {
      const parts = [turn[2] as string];
      while (i + 1 < lines.length && (lines[i + 1] as string).trim() !== "")
        parts.push((lines[++i] as string).trim());
      events.push({ kind: turn[1] === "Agent" ? "agent" : "caller", text: parts.join(" ") });
      continue;
    }
    const call = /^\*\*Tool call:\*\* `([a-z_]+)`$/.exec(line);
    if (call) {
      pending = { kind: "tool_call", name: call[1] as string };
      continue;
    }
    const result = /^\*\*Tool result:\*\* HTTP (\d{3})$/.exec(line);
    if (result) {
      pending = { kind: "tool_result", status: Number(result[1]) };
      continue;
    }
    if (line === "```json") {
      if (!pending) throw new Error(`JSON block without a tool line at line ${i + 1}`);
      const start = i + 1;
      while (i + 1 < lines.length && lines[i + 1] !== "```") i++;
      const json = JSON.parse(lines.slice(start, i + 1).join("\n")) as unknown;
      i++;
      events.push(
        pending.kind === "tool_call"
          ? { kind: "tool_call", name: pending.name, args: json }
          : { kind: "tool_result", status: pending.status, body: json },
      );
      pending = null;
    }
  }
  if (pending) throw new Error("A tool line has no JSON block.");
  return events;
}
