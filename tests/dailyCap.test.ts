import { describe, expect, it } from "vitest";
import { countMessage, DAILY_CAP, overDailyCap, sydneyDay } from "@/lib/api/dailyCap";

describe("daily cap (memory mode)", () => {
  it("uses the Sydney calendar day", () => {
    // 2026-10-24 14:30 UTC is 25 Oct 01:30 in Sydney (AEDT, UTC+11)
    expect(sydneyDay(new Date("2026-10-24T14:30:00Z"))).toBe("2026-10-25");
  });
  it("allows up to the cap, then blocks", async () => {
    const day = new Date("2030-01-15T00:00:00Z");
    for (let i = 0; i < DAILY_CAP; i++) expect(await overDailyCap(day)).toBe(false);
    expect(await overDailyCap(day)).toBe(true);
  });
  it("resets the next day", async () => {
    expect(await countMessage(new Date("2030-01-17T00:00:00Z"))).toBe(1);
  });
});
