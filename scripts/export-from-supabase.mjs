#!/usr/bin/env node
// One-shot handover script. Run after voting closes to produce:
//   - dogs.json (public, no vote counts, sorted by final rank, local photo paths)
//   - archive/final-tallies-2026.json (private, raw vote counts; gitignored)
//   - images/dogs/*.jpg (downloaded copies of every approved candidate's photo)
//
// Usage:
//   node scripts/export-from-supabase.mjs
//
// Reads SUPABASE_URL and SUPABASE_ANON_KEY from the environment if set;
// otherwise falls back to the public production values that already appear
// in supabase-client.js. The anon key is intentionally public — do NOT swap
// it for a service-role key here.

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SUPABASE_URL = process.env.SUPABASE_URL || "https://scupbstsavzjqamuixtp.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_Vw94Ithe9BSSEa46skdxXw_MSZQ0lZ2";
const STORAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/nominations`;
const REST_PREFIX = `${SUPABASE_URL}/rest/v1`;
const ARCHIVE_YEAR = 2026;

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function rest(path) {
  const res = await fetch(`${REST_PREFIX}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function downloadPhoto(remotePath, localPath) {
  const res = await fetch(`${STORAGE_PREFIX}/${remotePath}`);
  if (!res.ok) throw new Error(`Photo ${remotePath} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buf);
}

async function main() {
  console.log(`Source: ${SUPABASE_URL}`);

  const [dogs, counts] = await Promise.all([
    rest("/dogs_public?select=*"),
    rest("/dog_vote_counts?select=*"),
  ]);
  console.log(`Pulled ${dogs.length} approved dogs, ${counts.length} vote-count rows.`);

  const countMap = new Map(counts.map((c) => [c.dog_id, c.votes]));

  const enriched = dogs.map((d) => ({
    dog: d,
    votes: countMap.get(d.id) || 0,
  }));
  enriched.sort((a, b) => b.votes - a.votes);

  await mkdir(join(ROOT, "images", "dogs"), { recursive: true });
  await mkdir(join(ROOT, "archive"), { recursive: true });

  const publicEntries = [];
  const privateEntries = [];

  for (let i = 0; i < enriched.length; i++) {
    const { dog, votes } = enriched[i];
    const rank = i + 1;
    const ext = extname(dog.photo_path) || ".jpg";
    const localName = `${dog.id}${ext}`;
    const localPath = join("images", "dogs", localName);
    const absLocalPath = join(ROOT, localPath);
    process.stdout.write(`#${String(rank).padStart(2, " ")} ${dog.name} — downloading photo… `);
    try {
      await downloadPhoto(dog.photo_path, absLocalPath);
      console.log("ok");
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      throw e;
    }
    publicEntries.push({
      id: dog.id,
      name: dog.name,
      breed: dog.breed,
      age: dog.age,
      owner: dog.owner_name,
      street: dog.home_street,
      quote: dog.tagline,
      platform: dog.platform || [],
      photo_url: localPath.split("\\").join("/"),
      final_rank: rank,
    });
    privateEntries.push({
      id: dog.id,
      name: dog.name,
      final_rank: rank,
      votes,
      photo_path: dog.photo_path,
    });
  }

  // Orphan vote counts (rows in dog_vote_counts whose dog isn't in dogs_public)
  // — usually means the dog was removed for fraud. Preserve them in the archive.
  const seen = new Set(dogs.map((d) => d.id));
  const orphans = counts.filter((c) => !seen.has(c.dog_id));

  await writeFile(
    join(ROOT, "dogs.json"),
    JSON.stringify(publicEntries, null, 2) + "\n",
    "utf8"
  );
  console.log(`Wrote dogs.json (${publicEntries.length} entries).`);

  const archivePath = join(ROOT, "archive", `final-tallies-${ARCHIVE_YEAR}.json`);
  await writeFile(
    archivePath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: SUPABASE_URL,
        approved_dogs: privateEntries,
        orphan_vote_counts: orphans,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(`Wrote ${archivePath} (${privateEntries.length} ranked + ${orphans.length} orphan rows).`);

  console.log("\nNext steps:");
  console.log("  1. Run `pg_dump` against Supabase and stash the result alongside the archive file.");
  console.log("  2. Verify dogs.json renders correctly by opening index.html via a local server.");
  console.log("  3. Commit dogs.json + images/dogs/ + index.html + app-static.jsx and push.");
  console.log("  4. After confirming the Netlify deploy is live, cancel the Supabase paid plan.");
}

main().catch((e) => {
  console.error("Export failed:", e);
  process.exit(1);
});
