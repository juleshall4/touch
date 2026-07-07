import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };
type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";
type FingerPoint = { hand: number; finger: Finger; x: number; y: number };
type Calibration = { keys: Record<string, Point>; size: number };

const keys = "qwertyuiopasdfghjkl;zxcvbnm,./ ".split("");
const heatmapRows = [
  { keys: "qwertyuiop", offset: "pl-0" },
  { keys: "asdfghjkl;", offset: "pl-6" },
  { keys: "zxcvbnm,./", offset: "pl-12" },
  { keys: " ", offset: "pl-28" },
];
const heatmapKeys = heatmapRows.map((row) => row.keys).join("").split("");
const wordBank = "time hand learn place index middle ring pinky thumb keyboard camera touch type focus home row fast slow clean green yellow orange red blue score practice".split(" ");
const expectedFingerByKey: Record<string, Finger> = {
  q: "pinky", a: "pinky", z: "pinky",
  w: "ring", s: "ring", x: "ring",
  e: "middle", d: "middle", c: "middle",
  r: "index", f: "index", v: "index", t: "index", g: "index", b: "index",
  y: "index", h: "index", n: "index", u: "index", j: "index", m: "index",
  i: "middle", k: "middle", ",": "middle",
  o: "ring", l: "ring", ".": "ring",
  p: "pinky", ";": "pinky", "/": "pinky",
  " ": "thumb",
};
const fingerColors: Record<Finger, string> = {
  thumb: "#0078ff",
  index: "#40ff40",
  middle: "#ffd400",
  ring: "#ff9d00",
  pinky: "#ff3b30",
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
  return Array.from({ length: 10 }, () => wordBank[Math.floor(Math.random() * wordBank.length)]).join(" ");
}

function emptyStats() {
  return Object.fromEntries(heatmapKeys.map((key) => [key, { correct: 0, total: 0 }])) as Record<string, { correct: number; total: number }>;
}

function label(key: string) {
  return key === " " ? "space" : key;
}

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fingersRef = useRef<FingerPoint[]>([]);
  const [status, setStatus] = useState("starting camera");
  const [selectedKey, setSelectedKey] = useState("q");
  const [calibration, setCalibration] = useState<Calibration>(() => {
    const saved = JSON.parse(localStorage.getItem("touchCalibration") || "null");
    return saved?.keys ? saved : defaultCalibration;
  });
  const [prompt, setPrompt] = useState(randomPrompt);
  const [typed, setTyped] = useState<string[]>([]);
  const [debug, setDebug] = useState({ key: "-", expected: "-", finger: "-", hand: "-", result: "-", hint: "press any letter key" });
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [keyStats, setKeyStats] = useState(emptyStats);

  useEffect(() => {
    let stopped = false;
    let frame = 0;
    let landmarker: HandLandmarker | null = null;

    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
      setStatus("tracking");

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
        ctx.save();
        ctx.translate(videoRect.x + videoRect.width, videoRect.y);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, videoRect.width, videoRect.height);
        ctx.restore();

        const results = landmarker.detectForVideo(video, performance.now());
        fingersRef.current = extractFingers(results.landmarks, videoRect, rect.width, rect.height);
        drawHands(ctx, results.landmarks, videoRect);
        frame = requestAnimationFrame(tick);
      };
      tick();
    }

    start().catch((error) => setStatus(error instanceof Error ? error.message : "camera failed"));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      landmarker?.close();
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("touchCalibration", JSON.stringify(calibration));
  }, [calibration]);

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
        const next = value.length < prompt.length ? [...value, key] : value;
        if (next.length === prompt.length) setTimeout(() => setPrompt(randomPrompt()), 0);
        return next.length === prompt.length ? [] : next;
      });
      scoreKey(key);
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [calibration, prompt]);

  const heatmap = useMemo(() => keyStats, [keyStats]);
  const keyShapes = useMemo(() => buildKeyShapes(calibration.corners), [calibration]);

  function resetPractice() {
    setDebug({ key: "-", expected: "-", finger: "-", hand: "-", result: "-", hint: "press any letter key" });
    setScore({ correct: 0, total: 0 });
    setKeyStats(emptyStats());
    setPrompt(randomPrompt());
    setTyped([]);
  }

  function scoreKey(key: string) {
    const expected = expectedFingerByKey[key];
    const observed = pressedFinger(key, keyShapes, fingersRef.current);
    const correct = observed.finger === expected;
    setDebug({
      key: label(key),
      expected: expected || "-",
      finger: observed.finger || "-",
      hand: observed.hand,
      result: observed.finger && expected ? (correct ? "correct" : "wrong") : "-",
      hint: observed.hint,
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

  function moveCorner(event: React.PointerEvent<HTMLElement>, corner = draggingCorner) {
    if (corner == null) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
    setCalibration((value) => {
      const corners = [...value.corners] as Calibration["corners"];
      corners[corner] = point;
      return { corners };
    });
  }

  return (
    <main className="mx-auto w-full max-w-[900px] px-3 py-3">
      <header className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-medium text-[#e2b714] text-xl">Touch</h1>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Button variant="secondary" onClick={() => setCalibration(defaultCalibration)}><RotateCcw className="h-4 w-4" />reset warp</Button>
          <span>{status}</span>
        </div>
      </header>

      <section
        ref={previewRef}
        className="relative aspect-video overflow-hidden rounded-md border border-border bg-black touch-none"
        onPointerMove={moveCorner}
        onPointerUp={() => setDraggingCorner(null)}
        onPointerLeave={() => setDraggingCorner(null)}
      >
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="h-full w-full" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {keyShapes.map((shape) => (
            <polygon
              fill="rgba(0,0,0,0.12)"
              key={shape.key}
              points={shape.polygon.map((point) => `${point.x},${point.y}`).join(" ")}
              stroke={fingerColors[expectedFingerByKey[shape.key]] || "#e2b714"}
              strokeWidth="0.003"
            />
          ))}
          {keyShapes.map((shape) => (
            <text
              dominantBaseline="middle"
              fill={fingerColors[expectedFingerByKey[shape.key]] || "#e2b714"}
              fontSize="0.018"
              fontWeight="700"
              key={`${shape.key}-label`}
              textAnchor="middle"
              x={shape.center.x}
              y={shape.center.y}
            >
              {label(shape.key)}
            </text>
          ))}
          <polygon fill="none" points={calibration.corners.map((point) => `${point.x},${point.y}`).join(" ")} stroke="#e2b714" strokeWidth="0.006" />
        </svg>
        {calibration.corners.map((point, index) => (
          <button
            aria-label={`drag corner ${index + 1}`}
            className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-primary shadow"
            key={index}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDraggingCorner(index);
              moveCorner(event, index);
            }}
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            type="button"
          />
        ))}
      </section>

      <Prompt prompt={prompt} typed={typed} />

      <section className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-border bg-card p-2.5 text-muted-foreground text-sm">
        <span>key <strong className="text-primary">{debug.key}</strong></span>
        <span>expected <strong className="text-primary">{debug.expected}</strong></span>
        <span>observed <strong className="text-primary">{debug.finger}</strong></span>
        <span>hand <strong className="text-primary">{debug.hand}</strong></span>
        <span>result <strong className={cn(debug.result === "correct" && "text-[#40ff40]", debug.result === "wrong" && "text-[#ca4754]")}>{debug.result}</strong></span>
        <span>score <strong className="text-primary">{score.correct}/{score.total} {score.total ? Math.round((score.correct / score.total) * 100) : 0}%</strong></span>
        <span>{debug.hint}</span>
      </section>

      <KeyboardHeatmap stats={heatmap} />
    </main>
  );
}

function Prompt({ prompt, typed }: { prompt: string; typed: string[] }) {
  return (
    <div className="mt-2 select-none text-[clamp(18px,3vw,28px)] text-muted-foreground leading-snug">
      {[...prompt].map((char, index) => (
        <span
          className={cn(
            "border-l-2 border-transparent",
            typed[index] != null && (typed[index] === char ? "text-[#d1d0c5]" : "text-[#ca4754]"),
            index === typed.length && "border-l-primary",
          )}
          key={`${char}-${index}`}
        >
          {char}
        </span>
      ))}
    </div>
  );
}

function KeyboardHeatmap({ stats }: { stats: Record<string, { correct: number; total: number }> }) {
  return (
    <section className="mt-3 flex justify-center">
      <div className="w-fit rounded-md border border-border bg-card p-2.5">
        <div className="flex flex-col gap-1">
          {heatmapRows.map((row) => (
            <div className={cn("flex gap-1", row.offset)} key={row.keys}>
              {[...row.keys].map((key) => (
                <div
                  className={cn(
                    "h-7 rounded-md border border-black/30 text-center font-medium text-[#111] shadow-inner",
                    key === " " ? "w-48 text-xs leading-7" : "w-8 text-sm leading-7",
                  )}
                  key={key}
                  style={{ background: heatColor(stats[key]) }}
                >
                  {label(key)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function heatColor(stat = { correct: 0, total: 0 }) {
  const accuracy = stat.total ? stat.correct / stat.total : 1;
  const red = Math.round(202 + (64 - 202) * accuracy);
  const green = Math.round(71 + (255 - 71) * accuracy);
  return `rgb(${red}, ${green}, 71)`;
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
        x: (videoRect.x + (1 - point.x) * videoRect.width) / width,
        y: (videoRect.y + point.y * videoRect.height) / height,
      };
    }),
  );
}

function drawHands(ctx: CanvasRenderingContext2D, hands: NormalizedLandmark[][], videoRect: { x: number; y: number; width: number; height: number }) {
  for (const landmarks of hands) {
    const points = landmarks.map((point) => ({ x: videoRect.x + (1 - point.x) * videoRect.width, y: videoRect.y + point.y * videoRect.height }));
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#b4b4b4";
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

function bilinear(corners: Calibration["corners"], x: number, y: number) {
  const top = mix(corners[0], corners[1], x);
  const bottom = mix(corners[3], corners[2], x);
  return mix(top, bottom, y);
}

function mix(a: Point, b: Point, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function buildKeyShapes(corners: Calibration["corners"]): KeyShape[] {
  return keyboardRows.flatMap((row, rowIndex) => {
    const rowHeight = 1 / keyboardRows.length;
    const y1 = rowIndex * rowHeight;
    const y2 = (rowIndex + 1) * rowHeight;
    if (row === " ") {
      const x1 = 0.25;
      const x2 = 0.75;
      return [{
        key: " ",
        center: bilinear(corners, 0.5, (y1 + y2) / 2),
        polygon: [
          bilinear(corners, x1, y1),
          bilinear(corners, x2, y1),
          bilinear(corners, x2, y2),
          bilinear(corners, x1, y2),
        ] as [Point, Point, Point, Point],
      }];
    }

    const rowOffset = rowIndex === 0 ? 0 : rowIndex === 1 ? 0.05 : 0.1;
    const rowWidth = 0.9;
    return [...row].map((key, keyIndex) => {
      const x1 = rowOffset + (keyIndex / row.length) * rowWidth;
      const x2 = rowOffset + ((keyIndex + 1) / row.length) * rowWidth;
      return {
        key,
        center: bilinear(corners, (x1 + x2) / 2, (y1 + y2) / 2),
        polygon: [
          bilinear(corners, x1, y1),
          bilinear(corners, x2, y1),
          bilinear(corners, x2, y2),
          bilinear(corners, x1, y2),
        ] as [Point, Point, Point, Point],
      };
    });
  });
}

function pressedFinger(key: string, keyShapes: KeyShape[], fingers: FingerPoint[]) {
  const shape = keyShapes.find((candidate) => candidate.key === key);
  if (!shape) return { finger: "", hand: "-", hint: "key not in overlay" };
  if (!fingers.length) return { finger: "", hand: "-", hint: "no hands tracked" };

  const match = fingers
    .map((finger) => ({
      ...finger,
      distance: Math.hypot(finger.x - shape.center.x, finger.y - shape.center.y),
      inside: pointInPolygon(finger, shape.polygon),
    }))
    .sort((a, b) => Number(b.inside) - Number(a.inside) || a.distance - b.distance)[0];

  return {
    finger: match.finger,
    hand: `hand ${match.hand + 1}`,
    hint: match.inside ? "finger inside warped key" : "nearest tracked fingertip",
  };
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
