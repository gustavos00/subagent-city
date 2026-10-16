import { createRgba } from "./palette";

describe("createRgba", () => {
  it("resolves long and short hex colours", () => {
    expect(createRgba("#ffd34d", 0.5)).toBe("rgba(255, 211, 77, 0.5)");
    expect(createRgba("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  it("rejects anything else", () => {
    expect(() => createRgba("red", 1)).toThrow();
  });
});
