import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { COMMUNITY_POINTS } from "@/config/community";

describe("Karma Synchronization Audit (Item 7)", () => {
  it("guarantees DB trigger karma increment/decrement matches COMMUNITY_POINTS.DISCUSSION_UPVOTE_KARMA exactly", () => {
    const configKarma = COMMUNITY_POINTS.DISCUSSION_UPVOTE_KARMA;
    expect(configKarma).toBe(15);

    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261102_community_features.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Match increment in trg_on_discussion_vote_insert
    const insertMatch = sql.match(/karma_points\s*=\s*COALESCE\(karma_points,\s*0\)\s*\+\s*(\d+)/i);
    expect(insertMatch).not.toBeNull();
    const dbIncrement = parseInt(insertMatch![1], 10);

    // Match decrement in trg_on_discussion_vote_delete
    const deleteMatch = sql.match(/karma_points\s*=\s*GREATEST\(0,\s*COALESCE\(karma_points,\s*0\)\s*-\s*(\d+)\)/i);
    expect(deleteMatch).not.toBeNull();
    const dbDecrement = parseInt(deleteMatch![1], 10);

    // Both trigger values must match the config value
    expect(dbIncrement).toBe(configKarma);
    expect(dbDecrement).toBe(configKarma);
  });
});

