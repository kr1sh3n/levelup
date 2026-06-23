// Tiny pixel-art glyphs drawn as SVG rects. fill=currentColor so they inherit
// the surrounding text color (skill color, streak orange, etc.).
const SPRITES = {
  flame: { w: 8, h: 8, cells: [[4,0],[3,1],[4,1],[3,2],[4,2],[5,2],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[5,4],[6,4],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[2,6],[3,6],[4,6],[5,6],[3,7],[4,7]] },
  dumbbell: { w: 9, h: 7, cells: [[0,2],[1,2],[7,2],[8,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[0,4],[1,4],[7,4],[8,4]] },
  book: { w: 7, h: 7, cells: [[0,1],[1,1],[2,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[0,4],[3,4],[6,4],[0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5]] },
  play: { w: 8, h: 7, cells: [[2,0],[2,1],[3,1],[2,2],[3,2],[4,2],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[2,5],[3,5],[2,6]] },
  plus: { w: 7, h: 7, cells: [[3,0],[3,1],[3,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[3,4],[3,5],[3,6]] },
  star: { w: 7, h: 7, cells: [[3,0],[3,1],[2,2],[3,2],[4,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[2,4],[3,4],[4,4],[1,5],[2,5],[4,5],[5,5],[0,6],[6,6]] },
  bolt: { w: 7, h: 8, cells: [[4,0],[3,1],[4,1],[2,2],[3,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[2,5],[3,5],[3,6],[2,7]] },
};

export default function PixelIcon({ name, size = 16 }) {
  const s = SPRITES[name];
  if (!s) return null;
  return (
    <svg
      width={size}
      height={Math.round((size * s.h) / s.w)}
      viewBox={`0 0 ${s.w} ${s.h}`}
      style={{ display: "inline-block", verticalAlign: "-2px", imageRendering: "pixelated", flexShrink: 0 }}
      aria-hidden="true"
    >
      {s.cells.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1.04" height="1.04" fill="currentColor" />
      ))}
    </svg>
  );
}
