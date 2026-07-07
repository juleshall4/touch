# Touch

![Touch app preview placeholder](https://placehold.co/1200x630/e5e7eb/6b7280?text=Touch+typing+practice+with+live+hand+tracking)

Touch is a playful typing practice app that watches your hands while you type.
It uses your camera to track fingertips, compares each keypress with the finger
that should have pressed it, and turns practice into a quick feedback loop.

The goal is simple: make touch typing visible.

## What It Does

- Tracks both hands in the browser with MediaPipe hand landmarks.
- Lets you calibrate where keys appear in the camera preview.
- Scores each keypress against the expected touch-typing finger.
- Shows a live prompt, score, debug readout, and per-key heatmap.
- Keeps calibration in local browser storage, so setup survives refreshes.

![Camera calibration placeholder](https://placehold.co/1200x675/f3f4f6/6b7280?text=Camera+preview+%2B+calibrated+keyboard+overlay)

## Why It Exists

Most typing tools only know what you typed. Touch cares how you typed it.

That makes it useful for catching small habits that are hard to notice in the
moment: stretching the wrong finger, drifting away from home row, or favoring one
hand when another should be doing the work.

## Quick Start

Install dependencies:

```sh
bun install
```

Run the app:

```sh
bun run dev
```

Then open the local URL from Vite and allow camera access.

## Using Touch

1. Put your keyboard and hands clearly in view of the camera.
2. Select a key from the control bar.
3. Click that key's position in the camera preview.
4. Repeat until the keyboard overlay matches your real keyboard.
5. Type the prompt and watch the score, status, and heatmap update.

Press `Tab` to reset the practice round.

![Typing heatmap placeholder](https://placehold.co/1200x520/e5e7eb/6b7280?text=Per-key+accuracy+heatmap)

## Project Shape

```txt
src/
  App.tsx              browser camera, hand tracking, calibration, scoring
  components/ui/      small reusable UI pieces
  lib/                shared utilities
```

## Scripts

```sh
bun run dev      # start the Vite dev server
bun run build    # type-check and build for production
bun run preview  # preview the production build
```

## Tech

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- MediaPipe Tasks Vision
- Bun

## Notes

Touch is early, local-first, and intentionally small. Calibration is manual
because it keeps the first version understandable and lets the app adapt to real
desks, cameras, keyboards, and lighting without pretending the physical world is
tidier than it is.
