import { useCallback, useEffect, useState } from "react";

const KEY_LEFT = "mycd.leftWidth";
const KEY_TOP = "mycd.topHeight";

const DEFAULT_LEFT = 320;
const DEFAULT_TOP = 240;
const MIN_LEFT = 200;
const MAX_LEFT = 900;
const MIN_TOP = 80;
const MAX_TOP = 900;

function readNum(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage?.getItem(key);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function usePaneSizes() {
  const [leftWidth, setLeftWidthState] = useState(() =>
    clamp(readNum(KEY_LEFT, DEFAULT_LEFT), MIN_LEFT, MAX_LEFT)
  );
  const [topHeight, setTopHeightState] = useState(() =>
    clamp(readNum(KEY_TOP, DEFAULT_TOP), MIN_TOP, MAX_TOP)
  );

  useEffect(() => {
    window.localStorage?.setItem(KEY_LEFT, String(leftWidth));
  }, [leftWidth]);
  useEffect(() => {
    window.localStorage?.setItem(KEY_TOP, String(topHeight));
  }, [topHeight]);

  const adjustLeft = useCallback((delta: number) => {
    setLeftWidthState((w) => clamp(w + delta, MIN_LEFT, MAX_LEFT));
  }, []);
  const adjustTop = useCallback((delta: number) => {
    setTopHeightState((h) => clamp(h + delta, MIN_TOP, MAX_TOP));
  }, []);

  return { leftWidth, topHeight, adjustLeft, adjustTop };
}
