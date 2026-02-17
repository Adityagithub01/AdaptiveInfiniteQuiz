import { readdir, readFile } from "fs/promises";
import path from "path";
import { db } from "../config/database";

async function main() {
  const migrationsDir = path.resolve(__dirname, "../../migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  console.log(`Running ${files.length} migration(s)...`);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await readFile(fullPath, "utf8");
      console.log(`Applying ${file}...`);
      await client.query(sql);
    }
    await client.query("COMMIT");
    console.log("✅ Migrations complete");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

