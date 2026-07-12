import { afterEach, describe, expect, it, vi } from "vitest";
import { publicActionError, SafeActionError } from "./action-errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publicActionError", () => {
  it("allows explicitly safe policy messages", () => {
    expect(
      publicActionError(new SafeActionError("Free limit reached."), "Generic failure."),
    ).toBe("Free limit reached.");
  });

  it("never exposes database or infrastructure details", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const internal = new Error(
      'Failed query: insert into "rate_limits" params: private-value',
    );
    const message = publicActionError(
      internal,
      "Unable to sign in right now. Please try again shortly.",
    );

    expect(message).toBe("Unable to sign in right now. Please try again shortly.");
    expect(message).not.toContain("rate_limits");
    expect(message).not.toContain("private-value");
    expect(log).toHaveBeenCalledOnce();
  });
});
