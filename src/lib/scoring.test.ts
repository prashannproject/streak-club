import { describe, expect, it } from "vitest";
import {
  averageConsistencyScore,
  currentStreak,
  dailyConsistencyScore,
} from "./scoring";

describe("dailyConsistencyScore", () => {
  it("gives the same maximum regardless of habit count", () => {
    expect(dailyConsistencyScore(1, 1)).toBe(100);
    expect(dailyConsistencyScore(2, 2)).toBe(100);
    expect(dailyConsistencyScore(3, 3)).toBe(100);
  });

  it("normalizes partial completion and bounds invalid values", () => {
    expect(dailyConsistencyScore(1, 3)).toBe(33);
    expect(dailyConsistencyScore(99, 3)).toBe(100);
    expect(dailyConsistencyScore(1, 0)).toBe(0);
  });
});

describe("averageConsistencyScore", () => {
  it("averages daily scores without inflating empty history", () => {
    expect(averageConsistencyScore([100, 50, 0])).toBe(50);
    expect(averageConsistencyScore([])).toBe(0);
  });
});

describe("currentStreak", () => {
  it("counts contiguous completed dates ending today", () => {
    expect(
      currentStreak(["2026-07-09", "2026-07-10", "2026-07-11"], "2026-07-11"),
    ).toBe(3);
    expect(currentStreak(["2026-07-09"], "2026-07-11")).toBe(0);
  });
});
