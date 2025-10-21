export function svgLine(x1: number, y1: number, x2: number, y2: number, color: string, width: number, bondClass?: string): string {
  const classAttr = bondClass ? ` class='${bondClass}'` : '';
  return `<path${classAttr} d='M ${x1.toFixed(1)},${y1.toFixed(1)} L ${x2.toFixed(1)},${y2.toFixed(1)}' style='fill:none;fill-rule:evenodd;stroke:${color};stroke-width:${width.toFixed(1)}px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1' />`;
}

export function svgWedgeBond(x1: number, y1: number, x2: number, y2: number, color: string, width: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const wedgeWidth = width * 3;
  
  const p1x = x2 + perpX * wedgeWidth / 2;
  const p1y = y2 + perpY * wedgeWidth / 2;
  const p2x = x2 - perpX * wedgeWidth / 2;
  const p2y = y2 - perpY * wedgeWidth / 2;
  
  return `<polygon points="${x1},${y1} ${p1x},${p1y} ${p2x},${p2y}" style="fill:${color};stroke:none;" />`;
}

export function svgDashedBond(x1: number, y1: number, x2: number, y2: number, color: string, width: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / len;
  const perpY = dx / len;
  const wedgeWidth = width * 3;
  const numDashes = 6;
  
  let svg = '';
  for (let i = 0; i < numDashes; i++) {
    const t = i / (numDashes - 1);
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    const dashWidth = (wedgeWidth * t) / 2;
    const lx1 = cx + perpX * dashWidth;
    const ly1 = cy + perpY * dashWidth;
    const lx2 = cx - perpX * dashWidth;
    const ly2 = cy - perpY * dashWidth;
    svg += `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" style="stroke:${color};stroke-width:${width}px;" />`;
  }
  return svg;
}

export function svgText(
  x: number,
  y: number,
  text: string,
  color: string,
  fontSize: number,
  fontFamily: string,
  options?: { background?: boolean; backgroundColor?: string; padding?: number }
): string {
  const bg = options?.background ?? false;
  const bgColor = options?.backgroundColor ?? '#FFFFFF';
  const padding = options?.padding ?? Math.max(2, Math.floor(fontSize * 0.15));

  // Simple text width estimate: approx 0.6 * fontSize per glyph
  const textWidth = Math.max(6, text.length * fontSize * 0.6);
  const textHeight = Math.max(8, fontSize * 1.2);

  if (!bg) {
    return `<text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="${fontFamily}" text-anchor="middle" alignment-baseline="middle">${text}</text>`;
  }

  const rectX = x - (textWidth / 2) - padding;
  const rectY = y - (textHeight / 2) - padding / 2;
  const rectW = textWidth + padding * 2;
  const rectH = textHeight + padding;

  // Draw background rect first, then text on top to ensure label is in the foreground
  return (`<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="2" ry="2" style="fill:${bgColor};stroke:none;" />` +
    `<text x="${x}" y="${y}" fill="${color}" font-size="${fontSize}" font-family="${fontFamily}" text-anchor="middle" alignment-baseline="middle">${text}</text>`);
}

export function svgCircle(cx: number, cy: number, r: number, color: string, width: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:none;stroke:${color};stroke-width:${width}px;" />`;
}
