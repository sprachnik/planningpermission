import { describe, it, expect } from "vitest";
import { wind16, elevationWind, windSuffix } from "./compass";

describe("wind16", () => {
  it("maps cardinal bearings to cardinal winds", () => {
    expect(wind16(0)).toBe("N");
    expect(wind16(90)).toBe("E");
    expect(wind16(180)).toBe("S");
    expect(wind16(270)).toBe("W");
    expect(wind16(360)).toBe("N");
  });

  it("rounds to the nearest of 16 winds", () => {
    expect(wind16(22.5)).toBe("NNE");
    expect(wind16(30)).toBe("NNE"); // nearer NNE (22.5) than NE (45)
    expect(wind16(40)).toBe("NE");
    expect(wind16(348.75)).toBe("N"); // rounds up across 360
  });

  it("normalises negative bearings", () => {
    expect(wind16(-90)).toBe("W");
    expect(wind16(-22.5)).toBe("NNW");
  });
});

describe("elevationWind", () => {
  it("NNE-facing plot: the S elevation faces SSW", () => {
    // plan-up faces 22.5° (NNE), so the south elevation looks 202.5° (SSW)
    expect(elevationWind("N", 22.5)).toBe("NNE");
    expect(elevationWind("S", 22.5)).toBe("SSW");
    expect(elevationWind("E", 22.5)).toBe("ESE");
    expect(elevationWind("W", 22.5)).toBe("WNW");
  });
});

describe("windSuffix", () => {
  it("is empty when plan north is true north", () => {
    expect(windSuffix("S", 0)).toBe("");
    expect(windSuffix("N", 720)).toBe("");
  });

  it("brackets the true wind otherwise", () => {
    expect(windSuffix("S", 22.5)).toBe(" (SSW)");
    expect(windSuffix("N", 45)).toBe(" (NE)");
  });
});
