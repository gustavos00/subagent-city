import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { MapModel, MapNode, Positions } from "../lib/layout";
import { createCanvasEngine } from "../map/canvasEngine";
import { drawMap } from "../map/drawMap";
import { createFitCamera, createZoomedCamera, readWheelPixels, type Camera } from "../map/geometry";
import { WHEEL_SENSITIVITY, ZOOM_STEP } from "../map/constants";
import { findNodeAt } from "../map/hitTest";

interface Scene {
  model: MapModel;
  pos: Positions;
  selectedId: string | null;
  hoverId: string | null;
}

interface CanvasRenderer {
  findNodeUnder: (x: number, y: number) => MapNode | null;
  readCamera: () => Camera;
  setCamera: (cam: Camera) => void;
  setHoverId: (id: string | null) => void;
  readSize: () => { width: number; height: number };
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const EMPTY_SIZE = { width: 0, height: 0 };

type SceneRef = RefObject<Scene>;
type CameraRef = RefObject<Camera>;

function createMapEngine(canvas: HTMLCanvasElement, sceneRef: SceneRef, camRef: CameraRef) {
  const engine = createCanvasEngine(canvas, (ctx, frame) =>
    drawMap(ctx, {
      ...sceneRef.current,
      ...frame.size,
      cam: camRef.current,
      palette: frame.palette,
      now: frame.now,
      animate: frame.animate,
    }),
  );
  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-readWheelPixels(event, rect.height) * WHEEL_SENSITIVITY);
    camRef.current = createZoomedCamera(camRef.current, factor, event.clientX - rect.left, event.clientY - rect.top);
    engine.requestDraw();
  };
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  return {
    ...engine,
    destroy: () => {
      canvas.removeEventListener("wheel", handleWheel);
      engine.destroy();
    },
  };
}

interface SceneSync {
  sceneRef: SceneRef;
  camRef: CameraRef;
  hasFittedRef: RefObject<boolean>;
  model: MapModel;
  pos: Positions;
  selectedId: string | null;
  readSize: () => { width: number; height: number };
  requestDraw: () => void;
}

/** Hands the latest model to the drawing loop, and fits the camera the first time there is something to show. */
function useSceneSync({ sceneRef, camRef, hasFittedRef, model, pos, selectedId, readSize, requestDraw }: SceneSync) {
  useEffect(() => {
    sceneRef.current = { model, pos, selectedId, hoverId: sceneRef.current.hoverId };
    if (!hasFittedRef.current && model.nodes.length) {
      camRef.current = createFitCamera(model, pos, readSize());
      hasFittedRef.current = true;
    }
    requestDraw();
  }, [sceneRef, camRef, hasFittedRef, model, pos, selectedId, readSize, requestDraw]);
}

/** Draws the map on the canvas: sizing, animation frames, the wheel zoom, the camera and the first fit. */
export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  model: MapModel,
  pos: Positions,
  selectedId: string | null,
): CanvasRenderer {
  const sceneRef = useRef<Scene>({ model, pos, selectedId, hoverId: null });
  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const engineRef = useRef<ReturnType<typeof createMapEngine> | null>(null);
  const hasFittedRef = useRef(false);

  const requestDraw = useCallback(() => {
    engineRef.current?.requestDraw();
  }, []);
  const readSize = useCallback(() => engineRef.current?.readSize() ?? EMPTY_SIZE, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createMapEngine(canvas, sceneRef, camRef);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [canvasRef]);

  useSceneSync({ sceneRef, camRef, hasFittedRef, model, pos, selectedId, readSize, requestDraw });

  const zoomBy = useCallback(
    (factor: number) => {
      const { width, height } = readSize();
      camRef.current = createZoomedCamera(camRef.current, factor, width / 2, height / 2);
      requestDraw();
    },
    [readSize, requestDraw],
  );

  return {
    findNodeUnder: (x, y) => findNodeAt(sceneRef.current.model, sceneRef.current.pos, camRef.current, x, y),
    readCamera: () => camRef.current,
    setCamera: (cam) => {
      camRef.current = cam;
      requestDraw();
    },
    setHoverId: (id) => {
      if (sceneRef.current.hoverId === id) return;
      sceneRef.current.hoverId = id;
      requestDraw();
    },
    readSize,
    fit: () => {
      camRef.current = createFitCamera(model, pos, readSize());
      requestDraw();
    },
    zoomIn: () => {
      zoomBy(ZOOM_STEP);
    },
    zoomOut: () => {
      zoomBy(1 / ZOOM_STEP);
    },
  };
}
