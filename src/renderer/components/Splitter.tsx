import { useEffect, useRef } from "react";

export type SplitterProps = {
  direction: "vertical" | "horizontal";
  onResize: (deltaPx: number) => void;
};

export function Splitter({ direction, onResize }: SplitterProps) {
  const lastRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Safety net: if the component unmounts mid-drag, still release globals.
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const beginDrag = (target: HTMLDivElement, pointerId: number, start: number): void => {
    lastRef.current = start;
    document.body.style.cursor =
      direction === "vertical" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    cleanupRef.current = () => {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // ignore - capture may already be released
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      lastRef.current = null;
      cleanupRef.current = null;
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    beginDrag(target, e.pointerId, direction === "vertical" ? e.clientX : e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (lastRef.current === null) return;
    const cur = direction === "vertical" ? e.clientX : e.clientY;
    const delta = cur - lastRef.current;
    if (delta !== 0) {
      onResize(delta);
      lastRef.current = cur;
    }
  };

  const endDrag = (): void => {
    cleanupRef.current?.();
  };

  return (
    <div
      className={`splitter splitter-${direction}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      role="separator"
      aria-orientation={direction === "vertical" ? "vertical" : "horizontal"}
    />
  );
}
