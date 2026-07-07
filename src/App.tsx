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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: false,
      });
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

  function resetPractice() {
    setDebug({ key: "-", expected: "-", finger: "-", hand: "-", result: "-", hint: "press any letter key" });
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

  function placeKey(event: React.MouseEvent<HTMLElement>) {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCalibration((value) => {
      return {
        ...value,
        keys: {
          ...value.keys,
          [selectedKey]: {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
          },
        },
      };
    });
    const next = keys[keys.indexOf(selectedKey) + 1];
    if (next) setSelectedKey(next);
  }

  return (
    <main className="mx-auto w-full max-w-[820px] px-3 py-3">
      <header className="mb-2 flex items-center justify-between gap-4">
        <h1 className="font-medium text-[#e2b714] text-xl">Touch</h1>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <select className="h-8 rounded-md border border-input bg-card px-2 text-card-foreground" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
            {keys.map((key) => <option key={key} value={key}>{label(key)}</option>)}
          </select>
          <input className="w-24" type="range" min="14" max="80" value={calibration.size} onChange={(event) => setCalibration((value) => ({ ...value, size: Number(event.target.value) }))} />
          <Button variant="secondary" onClick={() => setCalibration(defaultCalibration)}>clear</Button>
          <span>{status}</span>
        </div>
      </header>

      <section
        ref={previewRef}
        className="relative mx-auto aspect-video w-full max-w-[760px] overflow-hidden rounded-md border border-border bg-black"
        onClick={placeKey}
      >
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="h-full w-full" />
        {Object.entries(calibration.keys).map(([key, point]) => (
          <div
            className="pointer-events-none absolute grid place-items-center border-2 bg-black/20 font-bold text-xs [text-shadow:0_1px_2px_#000]"
            key={key}
            style={{
              width: calibration.size,
              height: calibration.size,
              left: `calc(${point.x * 100}% - ${calibration.size / 2}px)`,
              top: `calc(${point.y * 100}% - ${calibration.size / 2}px)`,
              color: key === selectedKey ? "#e2b714" : fingerColors[expectedFingerByKey[key]] || "#e2b714",
            }}
          >
            {label(key)}
          </div>
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

function pressedFinger(key: string, calibration: Calibration, fingers: FingerPoint[], preview: HTMLDivElement | null) {
  const keyPoint = calibration.keys[key];
  if (!keyPoint) return { finger: "", hand: "-", hint: "key not calibrated" };
  if (!fingers.length) return { finger: "", hand: "-", hint: "no hands tracked" };
  if (!preview) return { finger: "", hand: "-", hint: "preview missing" };

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
    hand: `hand ${match.hand + 1}`,
    hint: match.inside ? "finger inside calibrated key" : "nearest tracked fingertip",
  };
}
