import { phaseLabel, isLive, phaseColorClass, phaseColor, sportIcon, eventMeta } from "@/lib/utils";

describe("phaseLabel", () => {
  it("maps known phases", () => {
    expect(phaseLabel("scheduled")).toBe("Scheduled");
    expect(phaseLabel("live_first_half")).toBe("1st Half");
    expect(phaseLabel("live_q1")).toBe("Q1");
    expect(phaseLabel("finished")).toBe("Full Time");
    expect(phaseLabel("break")).toBe("Break");
  });

  it("returns raw value for unknown phase", () => {
    expect(phaseLabel("unknown_phase")).toBe("unknown_phase");
  });
});

describe("isLive", () => {
  it("returns true for live phases", () => {
    expect(isLive("live_first_half")).toBe(true);
    expect(isLive("live_q1")).toBe(true);
    expect(isLive("live_ot")).toBe(true);
    expect(isLive("break")).toBe(true);
  });

  it("returns false for non-live phases", () => {
    expect(isLive("scheduled")).toBe(false);
    expect(isLive("finished")).toBe(false);
    expect(isLive("postponed")).toBe(false);
  });

  it("handles null/undefined", () => {
    expect(isLive(null)).toBe(false);
    expect(isLive(undefined)).toBe(false);
    expect(isLive("")).toBe(false);
  });
});

describe("phaseColorClass", () => {
  it("returns green for live", () => {
    expect(phaseColorClass("live_first_half")).toBe("text-accent-green");
  });

  it("returns secondary for finished", () => {
    expect(phaseColorClass("finished")).toBe("text-text-secondary");
  });

  it("returns blue for scheduled", () => {
    expect(phaseColorClass("scheduled")).toBe("text-accent-blue");
  });

  it("returns red for other phases", () => {
    expect(phaseColorClass("cancelled")).toBe("text-accent-red");
  });
});

describe("phaseColor", () => {
  it("returns correct hex colors", () => {
    expect(phaseColor("live_q1")).toBe("#00E676");
    expect(phaseColor("finished")).toBe("#B8B8CC");
    expect(phaseColor("scheduled")).toBe("#448AFF");
    expect(phaseColor("cancelled")).toBe("#FF1744");
  });
});

describe("sportIcon", () => {
  it("maps known sports", () => {
    expect(sportIcon("soccer")).toBe("⚽");
    expect(sportIcon("basketball")).toBe("🏀");
    expect(sportIcon("hockey")).toBe("🏒");
    expect(sportIcon("baseball")).toBe("⚾");
  });

  it("returns trophy for unknown sport", () => {
    expect(sportIcon("cricket")).toBe("🏆");
  });
});

describe("eventMeta", () => {
  it("maps goal correctly", () => {
    const meta = eventMeta("goal");
    expect(meta.label).toBe("Goal");
    expect(meta.icon).toBe("⚽");
  });

  it("handles unknown event type", () => {
    const meta = eventMeta("some_event");
    expect(meta.label).toBe("some event");
    expect(meta.icon).toBe("•");
  });
});
