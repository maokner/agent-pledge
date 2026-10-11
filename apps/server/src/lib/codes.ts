import { newCode } from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { subtasks, tasks } from "../db/schema";

/** A claim code that no sub-task uses yet. (Insert can still race; the unique index is the guard.) */
export async function uniqueClaimCode(db: Db): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = newCode();
    const hit = await db
      .select({ id: subtasks.id })
      .from(subtasks)
      .where(eq(subtasks.claimCode, code))
      .limit(1);
    if (hit.length === 0) return code;
  }
  throw new Error("could not find a free claim code");
}

/** A board code that no task uses yet. */
export async function uniqueBoardCode(db: Db): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = newCode();
    const hit = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.boardCode, code))
      .limit(1);
    if (hit.length === 0) return code;
  }
  throw new Error("could not find a free board code");
}
