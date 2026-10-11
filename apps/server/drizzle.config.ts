import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` writes SQL migrations to ./drizzle from src/db/schema.ts.
// The schema is FROZEN after the foundation (see docs/api.md). Migrations run at server startup.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
