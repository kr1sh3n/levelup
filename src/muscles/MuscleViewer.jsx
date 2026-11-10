import { useEffect, useRef, useState } from "react";
import { createViewer, webglSupported } from "./viewer3d";

// props: colors { group: "#hex" }, selected group id | null, view { name, n } to
// trigger a camera move, onSelect(group | null), baseColor / floorColor,
// pulse [groups] (muscles that softly pulse to draw the eye) and labels (bool).
export default function MuscleViewer({ colors, selected, onSelect, view, baseColor, floorColor, pulse, labels }) {
  const box = useRef(null);
  const api = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [supported] = useState(webglSupported);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // Declared first so the viewer exists before the effects below push data into it.
  useEffect(() => {
    if (!supported || !box.current) return undefined;
    const v = createViewer(box.current, { onSelect: (g) => onSelectRef.current?.(g) });
    api.current = v;
    return () => {
      v.dispose();
      api.current = null;
    };
  }, [supported]);

  useEffect(() => {
    api.current?.setPalette({ base: baseColor, floor: floorColor });
  }, [baseColor, floorColor]);

  useEffect(() => {
    api.current?.setColors(colors);
  }, [colors]);

  useEffect(() => {
    api.current?.setSelected(selected);
  }, [selected]);

  useEffect(() => {
    api.current?.setPulse(pulse);
  }, [pulse]);

  useEffect(() => {
    api.current?.setLabels(labels !== false);
  }, [labels]);

  useEffect(() => {
    if (view) api.current?.setView(view.name);
  }, [view]);

  if (!supported) {
    return <div className="mm-fallback">3D isn&apos;t available on this device. The muscle list below shows the same data.</div>;
  }
  return <div className="mm-canvas" ref={box} role="img" aria-label="3D muscle map. Tap a muscle to see its weekly sets." />;
}
