import { useState, useRef, useCallback, type MouseEvent, type WheelEvent, type TouchEvent } from 'react';

export interface UseSvgPanZoomOptions {
  nominalWidth: number;
  nominalHeight: number;
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  initialPan?: { x: number; y: number };
  centerOrigin?: boolean;
}

export interface UseSvgPanZoomReturn {
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  hasPannedOrZoomed: boolean;
  viewBox: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  resetView: () => void;
  didDrag: () => boolean;
  containerProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    onWheel: (e: WheelEvent<HTMLDivElement>) => void;
    onMouseDown: (e: MouseEvent<HTMLDivElement>) => void;
    onMouseMove: (e: MouseEvent<HTMLDivElement>) => void;
    onMouseUp: (e: MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: (e: MouseEvent<HTMLDivElement>) => void;
    onDoubleClick: (e: MouseEvent<HTMLDivElement>) => void;
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => void;
    onTouchMove: (e: TouchEvent<HTMLDivElement>) => void;
    onTouchEnd: (e: TouchEvent<HTMLDivElement>) => void;
    style: React.CSSProperties;
  };
}

export function useSvgPanZoom({
  nominalWidth,
  nominalHeight,
  minZoom = 0.5,
  maxZoom = 4.0,
  initialZoom = 1,
  initialPan = { x: 0, y: 0 },
  centerOrigin = false,
}: UseSvgPanZoomOptions): UseSvgPanZoomReturn {
  const [zoom, setZoom] = useState<number>(initialZoom);
  const [pan, setPan] = useState<{ x: number; y: number }>(initialPan);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const totalDragDistRef = useRef<number>(0);
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);

  // Compute viewBox parameters
  const currentW = nominalWidth / zoom;
  const currentH = nominalHeight / zoom;
  const minX = centerOrigin
    ? -currentW / 2 - pan.x
    : (nominalWidth - currentW) / 2 - pan.x;
  const minY = centerOrigin
    ? -currentH / 2 - pan.y
    : (nominalHeight - currentH) / 2 - pan.y;
  const viewBox = `${minX} ${minY} ${currentW} ${currentH}`;

  const hasPannedOrZoomed = zoom !== 1 || Math.abs(pan.x) > 0.5 || Math.abs(pan.y) > 0.5;

  const clampZoom = useCallback(
    (z: number) => Math.max(minZoom, Math.min(maxZoom, +z.toFixed(2))),
    [minZoom, maxZoom]
  );

  const zoomIn = useCallback(
    (step = 0.25) => {
      setZoom((z) => clampZoom(z + step));
    },
    [clampZoom]
  );

  const zoomOut = useCallback(
    (step = 0.25) => {
      setZoom((z) => clampZoom(z - step));
    },
    [clampZoom]
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const didDrag = useCallback(() => {
    return totalDragDistRef.current > 4;
  }, []);

  // Handle Wheel & Touchpad Pinch/Pan
  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      // Mouse position as fraction 0..1 in container
      const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width || 1)));
      const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));

      const w = nominalWidth / zoom;
      const h = nominalHeight / zoom;
      const curMinX = centerOrigin ? -w / 2 - pan.x : (nominalWidth - w) / 2 - pan.x;
      const curMinY = centerOrigin ? -h / 2 - pan.y : (nominalHeight - h) / 2 - pan.y;
      const mouseSvgX = curMinX + fx * w;
      const mouseSvgY = curMinY + fy * h;

      const isPinch = e.ctrlKey || e.metaKey;

      // Trackpad 2-finger scroll when zoomed in: pan smoothly
      if (!isPinch && zoom > 1 && (Math.abs(e.deltaX) > 1 || (Math.abs(e.deltaY) < 35 && e.deltaY !== 0))) {
        const scale = w / (rect.width || 1);
        setPan((prev) => ({
          x: prev.x - e.deltaX * scale * 0.9,
          y: prev.y - e.deltaY * scale * 0.9,
        }));
        return;
      }

      // Zoom delta: trackpad pinch is fine-grained, physical wheel has larger notches
      const zoomDelta = isPinch ? -e.deltaY * 0.015 : e.deltaY < 0 ? 0.15 : -0.15;
      const newZoom = clampZoom(zoom + zoomDelta);
      if (newZoom === zoom) return;

      const newW = nominalWidth / newZoom;
      const newH = nominalHeight / newZoom;

      // Keep mouse pointer invariant in SVG coordinates
      const newMinX = mouseSvgX - fx * newW;
      const newMinY = mouseSvgY - fy * newH;
      const newPanX = centerOrigin ? -newW / 2 - newMinX : (nominalWidth - newW) / 2 - newMinX;
      const newPanY = centerOrigin ? -newH / 2 - newMinY : (nominalHeight - newH) / 2 - newMinY;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    },
    [zoom, pan, nominalWidth, nominalHeight, centerOrigin, clampZoom]
  );

  // Mouse Down for Pan
  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.button !== 1) return;
      setIsDragging(true);
      totalDragDistRef.current = 0;
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan]
  );

  // Mouse Move for Pan
  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStartRef.current || !containerRef.current) return;
      const dx = e.clientX - dragStartRef.current.clientX;
      const dy = e.clientY - dragStartRef.current.clientY;
      totalDragDistRef.current = Math.hypot(dx, dy);

      const rect = containerRef.current.getBoundingClientRect();
      const scale = (nominalWidth / zoom) / (rect.width || 1);

      setPan({
        x: dragStartRef.current.panX + dx * scale,
        y: dragStartRef.current.panY + dy * scale,
      });
    },
    [isDragging, nominalWidth, zoom]
  );

  // Mouse Up / Leave
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Double Click to Reset
  const handleDoubleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      resetView();
    },
    [resetView]
  );

  // Touch Support (Pinch and Drag)
  const handleTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1) {
        setIsDragging(true);
        totalDragDistRef.current = 0;
        dragStartRef.current = {
          clientX: e.touches[0].clientX,
          clientY: e.touches[0].clientY,
          panX: pan.x,
          panY: pan.y,
        };
      } else if (e.touches.length === 2) {
        setIsDragging(false);
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartDistRef.current = dist;
        touchStartZoomRef.current = zoom;
      }
    },
    [pan, zoom]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && isDragging && dragStartRef.current && containerRef.current) {
        const dx = e.touches[0].clientX - dragStartRef.current.clientX;
        const dy = e.touches[0].clientY - dragStartRef.current.clientY;
        totalDragDistRef.current = Math.hypot(dx, dy);

        const rect = containerRef.current.getBoundingClientRect();
        const scale = (nominalWidth / zoom) / (rect.width || 1);

        setPan({
          x: dragStartRef.current.panX + dx * scale,
          y: dragStartRef.current.panY + dy * scale,
        });
      } else if (e.touches.length === 2 && touchStartDistRef.current) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const ratio = dist / touchStartDistRef.current;
        setZoom(clampZoom(touchStartZoomRef.current * ratio));
      }
    },
    [isDragging, nominalWidth, zoom, clampZoom]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
    touchStartDistRef.current = null;
  }, []);

  return {
    zoom,
    pan,
    isDragging,
    hasPannedOrZoomed,
    viewBox,
    containerRef,
    setZoom,
    setPan,
    zoomIn,
    zoomOut,
    resetView,
    didDrag,
    containerProps: {
      ref: containerRef,
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onDoubleClick: handleDoubleClick,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      style: {
        cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
        userSelect: isDragging ? 'none' : 'auto',
      },
    },
  };
}
