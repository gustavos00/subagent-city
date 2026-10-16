import { createZoomedCamera, readNodeScale, readWheelPixels } from "./geometry";

describe("createZoomedCamera", () => {
  it("keeps the point under the cursor fixed", () => {
    const cam = createZoomedCamera({ x: 10, y: 20, k: 1 }, 2, 100, 100);
    expect(cam.k).toBe(2);
    expect(cam.x).toBe(100 - (100 - 10) * 2);
    expect(cam.y).toBe(100 - (100 - 20) * 2);
  });

  it("clamps the zoom to its limits", () => {
    expect(createZoomedCamera({ x: 0, y: 0, k: 2.9 }, 10, 0, 0).k).toBe(3);
    expect(createZoomedCamera({ x: 0, y: 0, k: 0.16 }, 0.01, 0, 0).k).toBe(0.15);
  });
});

describe("readNodeScale", () => {
  it("never shrinks nodes below a readable size", () => {
    expect(readNodeScale({ x: 0, y: 0, k: 0.2 })).toBe(0.6);
    expect(readNodeScale({ x: 0, y: 0, k: 2 })).toBe(2);
  });
});

describe("readWheelPixels", () => {
  it("normalises pixels, lines and pages", () => {
    expect(readWheelPixels({ deltaY: 10, deltaMode: 0 }, 500)).toBe(10);
    expect(readWheelPixels({ deltaY: 2, deltaMode: 1 }, 500)).toBe(32);
    expect(readWheelPixels({ deltaY: 1, deltaMode: 2 }, 500)).toBe(500);
  });
});
