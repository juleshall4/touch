import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { quotes } from "@/quotes";

type Point = { x: number; y: number };
type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";
type FingerPoint = { hand: number; finger: Finger; x: number; y: number };
type Calibration = { keys: Record<string, Point>; size: number };
type CalibrationSnapshot = { calibration: Calibration; selectedKey: string };

const keys = "qwertyuiopasdfghjkl;'zxcvbnm,./ ".split("");
const keyRows = ["qwertyuiopasdfgh", "jkl;'zxcvbnm,./ "];
const expectedFingerByKey: Record<string, Finger> = {
  q: "pinky", a: "pinky", z: "pinky",
  w: "ring", s: "ring", x: "ring",
  e: "middle", d: "middle", c: "middle",
  r: "index", f: "index", v: "index", t: "index", g: "index", b: "index",
  y: "index", h: "index", n: "index", u: "index", j: "index", m: "index",
  i: "middle", k: "middle", ",": "middle",
  o: "ring", l: "ring", ".": "ring",
  p: "pinky", ";": "pinky", ":": "pinky", "'": "pinky", "/": "pinky",
  " ": "thumb",
};
const fingerColors: Record<Finger, string> = {
  thumb: "#7aa2f7",
  index: "#9ece6a",
  middle: "#e0af68",
  ring: "#ff9e64",
  pinky: "#ff9e64",
};
const fingerTips: Record<Finger, number> = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const fingerLines: Record<Finger, number[]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};
const palmLines = [[0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17]];
const defaultCalibration: Calibration = { keys: {}, size: 36 };

function randomPrompt() {
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function emptyStats() {
  return Object.fromEntries(keys.map((key) => [key, { correct: 0, total: 0 }])) as Record<string, { correct: number; total: number }>;
}

function label(key: string) {
  return key === " " ? "space" : key;
}

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fingersRef = useRef<FingerPoint[]>([]);
  const [selectedKey, setSelectedKey] = useState("q");
  const [calibration, setCalibration] = useState<Calibration>(() => {
    const saved = JSON.parse(localStorage.getItem("touchCalibration") || "null");
    return saved?.keys ? saved : defaultCalibration;
  });
  const [prompt, setPrompt] = useState(randomPrompt);
  const [typed, setTyped] = useState<string[]>([]);
  const [debug, setDebug] = useState({ key: "-", expected: "-", finger: "-", result: "-" });
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [keyStats, setKeyStats] = useState(emptyStats);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [sessionChars, setSessionChars] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [calibrationOpen, setCalibrationOpen] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [undoStack, setUndoStack] = useState<CalibrationSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<CalibrationSnapshot[]>([]);

  useEffect(() => {
    let stopped = false;
    let frame = 0;
    let landmarker: HandLandmarker | null = null;

    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(selectedCamera ? { deviceId: { exact: selectedCamera } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: false,
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === "videoinput");
      setCameras(videoDevices);
      setSelectedCamera((value) => value || videoDevices[0]?.deviceId || "");

      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
      const tick = () => {
        if (stopped || !videoRef.current || !canvasRef.current || !landmarker) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const dpr = devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        const videoRect = containRect(video.videoWidth || 16, video.videoHeight || 9, rect.width, rect.height);
        ctx.drawImage(video, videoRect.x, videoRect.y, videoRect.width, videoRect.height);

        const results = landmarker.detectForVideo(video, performance.now());
        fingersRef.current = extractFingers(results.landmarks, videoRect, rect.width, rect.height);
        drawHands(ctx, results.landmarks, videoRect);
        frame = requestAnimationFrame(tick);
      };
      tick();
    }

    start().catch(console.error);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      landmarker?.close();
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [selectedCamera]);

  useEffect(() => {
    localStorage.setItem("touchCalibration", JSON.stringify(calibration));
  }, [calibration]);

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        resetPractice();
        return;
      }
      if (event.key === "Backspace") {
        setTyped((value) => value.slice(0, -1));
        return;
      }
      const key = event.key.toLowerCase();
      if (key.length !== 1) return;
      setTyped((value) => {
        if (value.length >= prompt.length) return value;
        setStartedAt((started) => started ?? Date.now());
        setSessionChars((count) => count + 1);
        setNow(Date.now());
        const next = [...value, key];
        if (next.length === prompt.length) {
          setTimeout(() => {
            setPrompt(randomPrompt());
          }, 0);
        }
        return next.length === prompt.length ? [] : next;
      });
      scoreKey(key);
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [calibration, prompt]);

  const heatmap = useMemo(() => keyStats, [keyStats]);
  const elapsedMinutes = startedAt ? Math.max((now - startedAt) / 60000, 1 / 60000) : 0;
  const wpm = elapsedMinutes ? Math.round(sessionChars / 5 / elapsedMinutes) : 0;

  function resetPractice() {
    setDebug({ key: "-", expected: "-", finger: "-", result: "-" });
    setScore({ correct: 0, total: 0 });
    setKeyStats(emptyStats());
    setPrompt(randomPrompt());
    setTyped([]);
  }

  function scoreKey(key: string) {
    const expected = expectedFingerByKey[key];
    const observed = pressedFinger(key, calibration, fingersRef.current, previewRef.current);
    const correct = observed.finger === expected;
    setDebug({
      key: label(key),
      expected: expected || "-",
      finger: observed.finger || "-",
      result: observed.finger && expected ? (correct ? "correct" : "wrong") : "-",
    });
    if (!observed.finger || !expected) return;
    setScore((value) => ({ correct: value.correct + (correct ? 1 : 0), total: value.total + 1 }));
    setKeyStats((stats) => ({
      ...stats,
      [key]: {
        correct: (stats[key]?.correct || 0) + (correct ? 1 : 0),
        total: (stats[key]?.total || 0) + 1,
      },
    }));
  }

  function placeKey(event: React.MouseEvent<HTMLElement>) {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    setKeyPosition(selectedKey, event.clientX, event.clientY, rect);
    const next = keys[keys.indexOf(selectedKey) + 1];
    if (next) setSelectedKey(next);
  }

  function setKeyPosition(key: string, clientX: number, clientY: number, rect = previewRef.current?.getBoundingClientRect()) {
    if (!rect) return;
    pushCalibration();
    setCalibration((value) => ({
      ...value,
      keys: {
        ...value.keys,
        [key]: {
          x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
          y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
        },
      },
    }));
  }

  function pushCalibration() {
    setUndoStack((stack) => [...stack, { calibration, selectedKey }]);
    setRedoStack([]);
  }

  function undoCalibration() {
    setUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      setRedoStack((redo) => [...redo, { calibration, selectedKey }]);
      setCalibration(previous.calibration);
      setSelectedKey(previous.selectedKey);
      return stack.slice(0, -1);
    });
  }

  function redoCalibration() {
    setRedoStack((stack) => {
      const next = stack.at(-1);
      if (!next) return stack;
      setUndoStack((undo) => [...undo, { calibration, selectedKey }]);
      setCalibration(next.calibration);
      setSelectedKey(next.selectedKey);
      return stack.slice(0, -1);
    });
  }

  function toggleCalibration() {
    setCalibrationOpen((value) => !value);
  }

  return (
    <main className="relative mx-auto min-h-screen w-[min(100%,860px)] px-3 py-3 animate-fade-in">
      <header className="flex items-start justify-between gap-4">
        <h1 className="font-medium text-primary text-xl">touch</h1>
      </header>

      <Button className="absolute right-3 top-3 h-8 border-transparent text-sm" tabIndex={-1} variant="secondary" onMouseDown={(event) => event.preventDefault()} onClick={toggleCalibration}>
        {calibrationOpen ? "x" : "calibration"}
      </Button>

      <div className={cn("calibration-panel mx-auto mt-4 grid max-w-[760px] gap-3 overflow-hidden rounded-lg bg-card p-2 transition-[max-height,opacity,transform,margin,padding] duration-200 ease-in-out", calibrationOpen ? "max-h-[620px] opacity-100" : "pointer-events-none mt-0 max-h-0 p-0 opacity-0 -translate-y-1")}>
            <section
              ref={previewRef}
              className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
              onClick={placeKey}
            >
              <video ref={videoRef} className="hidden" playsInline muted />
              <canvas ref={canvasRef} className="h-full w-full" />
              {Object.entries(calibration.keys).map(([key, point]) => (
                <div
                  className="absolute grid cursor-move touch-none place-items-center rounded-sm border-2 border-current bg-transparent font-bold text-xs"
                  key={key}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pushCalibration();
                  }}
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    const rect = previewRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setCalibration((value) => ({
                      ...value,
                      keys: {
                        ...value.keys,
                        [key]: {
                          x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
                          y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
                        },
                      },
                    }));
                  }}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  style={{
                    width: calibration.size,
                    height: calibration.size,
                    left: `calc(${point.x * 100}% - ${calibration.size / 2}px)`,
                    top: `calc(${point.y * 100}% - ${calibration.size / 2}px)`,
                    color: key === selectedKey ? "#7dcfff" : fingerColors[expectedFingerByKey[key]] || "#7dcfff",
                  }}
                >
                  {label(key)}
                </div>
              ))}
            </section>
            <div className="flex flex-wrap items-end gap-3">
              {cameras.length > 0 && <label className="grid min-w-44 flex-[2] gap-1 text-xs">
                <span className="text-muted-foreground">camera</span>
                <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                  <SelectTrigger className="border-transparent bg-background text-foreground">
                    <SelectValue placeholder="choose source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {cameras.map((camera, index) => (
                        <SelectItem key={camera.deviceId} value={camera.deviceId}>{camera.label || `camera ${index + 1}`}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>}
              <label className="grid min-w-36 flex-1 gap-1 text-xs">
                <span className="text-muted-foreground">key</span>
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger className="border-transparent bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {keys.map((key) => <SelectItem key={key} value={key}>{label(key)}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid min-w-44 flex-[2] gap-1 text-xs">
                <span className="text-muted-foreground">marker size</span>
                <input className="h-8 w-full accent-primary" type="range" min="14" max="80" value={calibration.size} onPointerDown={pushCalibration} onChange={(event) => setCalibration((value) => ({ ...value, size: Number(event.target.value) }))} />
              </label>
              <Button className="h-8 border-transparent text-xs" disabled={!undoStack.length} variant="secondary" onClick={undoCalibration}>undo</Button>
              <Button className="h-8 border-transparent text-xs" disabled={!redoStack.length} variant="secondary" onClick={redoCalibration}>redo</Button>
              <Button className="h-8 border-transparent text-xs" variant="secondary" onClick={() => {
                pushCalibration();
                setCalibration(defaultCalibration);
                setSelectedKey("q");
              }}>clear</Button>
            </div>
      </div>

      <div className={cn("practice-stack flex flex-col items-center justify-center gap-8 pb-12", calibrationOpen ? "min-h-0 pt-8" : "min-h-[calc(100vh-52px)]")}>
        <div className="grid justify-items-center gap-2">
          <section className="mx-auto flex max-w-full items-center justify-center gap-4 overflow-x-auto whitespace-nowrap rounded-lg bg-card px-3 py-2 text-muted-foreground text-xs">
            <span>key <strong className="text-primary">{debug.key}</strong></span>
            <span>expected <strong className="text-primary">{debug.expected}</strong></span>
            <span>observed <strong className="text-primary">{debug.finger}</strong></span>
            <span>result <strong className={cn(debug.result === "correct" && "text-[#9ece6a]", debug.result === "wrong" && "text-[#ff9e64]")}>{debug.result}</strong></span>
            <span>score <strong className="text-primary">{score.correct}/{score.total} {score.total ? Math.round((score.correct / score.total) * 100) : 0}%</strong></span>
            <span>wpm <strong className="text-primary">{wpm}</strong></span>
          </section>
        </div>

        <Prompt prompt={prompt} typed={typed} />

        <div className="grid justify-items-center gap-2">
          <KeyLine stats={heatmap} />
        </div>
      </div>

    </main>
  );
}

function Prompt({ prompt, typed }: { prompt: string; typed: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [caretLeft, setCaretLeft] = useState(0);
  const [caretTop, setCaretTop] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = charRefs.current[typed.length];
    const containerRect = container.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    setCaretLeft(targetRect ? targetRect.left - containerRect.left : container.scrollWidth);
    setCaretTop(targetRect ? targetRect.top - containerRect.top : 0);
  }, [prompt, typed.length]);

  return (
    <div ref={containerRef} className="relative mx-auto max-w-[760px] select-none text-left text-[clamp(22px,3vw,32px)] text-muted-foreground leading-snug">
      <span
        className="absolute h-[1.2em] w-0.5 rounded-full bg-primary transition-[left,top] duration-100 ease-out"
        style={{ left: caretLeft, top: caretTop }}
      />
      {[...prompt].map((char, index) => (
        <span
          className={cn(
            "transition-colors duration-100",
            typed[index] != null && (typed[index] === char.toLowerCase() ? "text-foreground" : "text-[#ff9e64]"),
          )}
          key={`${char}-${index}`}
          ref={(element) => {
            charRefs.current[index] = element;
          }}
        >
          {char}
        </span>
      ))}
    </div>
  );
}

function KeyLine({ stats }: { stats: Record<string, { correct: number; total: number }> }) {
  return (
    <section className="flex justify-center">
      <div className="grid max-w-full gap-1 overflow-x-auto">
        {keyRows.map((row) => (
          <div className="flex justify-center gap-1" key={row}>
            {[...row].map((key) => (
              <span
                className={cn(
                  "grid h-8 shrink-0 place-items-center rounded border border-border text-[11px] text-muted-foreground",
                  key === " " ? "w-14" : "w-8",
                )}
                key={key}
                style={{ backgroundColor: keyColor(stats[key]) }}
              >
                {label(key)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function keyColor(stat = { correct: 0, total: 0 }) {
  if (!stat.total) return "transparent";
  const accuracy = stat.correct / stat.total;
  return `color-mix(in srgb, transparent ${Math.round((1 - accuracy) * 100)}%, #24283B)`;
}

function containRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

function extractFingers(hands: NormalizedLandmark[][], videoRect: { x: number; y: number; width: number; height: number }, width: number, height: number): FingerPoint[] {
  return hands.flatMap((landmarks, hand) =>
    (Object.keys(fingerTips) as Finger[]).map((finger) => {
      const point = landmarks[fingerTips[finger]];
      return {
        hand,
        finger,
        x: (videoRect.x + point.x * videoRect.width) / width,
        y: (videoRect.y + point.y * videoRect.height) / height,
      };
    }),
  );
}

function drawHands(ctx: CanvasRenderingContext2D, hands: NormalizedLandmark[][], videoRect: { x: number; y: number; width: number; height: number }) {
  for (const landmarks of hands) {
    const points = landmarks.map((point) => ({ x: videoRect.x + point.x * videoRect.width, y: videoRect.y + point.y * videoRect.height }));
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#a9b1d6";
    for (const [start, end] of palmLines) drawLine(ctx, points[start], points[end]);
    for (const finger of Object.keys(fingerLines) as Finger[]) {
      ctx.strokeStyle = fingerColors[finger];
      ctx.fillStyle = fingerColors[finger];
      const line = fingerLines[finger];
      line.slice(1).forEach((point, index) => drawLine(ctx, points[line[index]], points[point]));
      for (const point of line) {
        ctx.beginPath();
        ctx.arc(points[point].x, points[point].y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawLine(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function pressedFinger(key: string, calibration: Calibration, fingers: FingerPoint[], preview: HTMLDivElement | null) {
  const keyPoint = calibration.keys[key];
  if (!keyPoint) return { finger: "" };
  if (!fingers.length) return { finger: "" };
  if (!preview) return { finger: "" };

  const rect = preview.getBoundingClientRect();
  const halfWidth = calibration.size / rect.width / 2;
  const halfHeight = calibration.size / rect.height / 2;

  const match = fingers
    .map((finger) => ({
      ...finger,
      distance: Math.hypot(finger.x - keyPoint.x, finger.y - keyPoint.y),
      inside: Math.abs(finger.x - keyPoint.x) <= halfWidth && Math.abs(finger.y - keyPoint.y) <= halfHeight,
    }))
    .sort((a, b) => Number(b.inside) - Number(a.inside) || a.distance - b.distance)[0];

  return {
    finger: match.finger,
  };
}
