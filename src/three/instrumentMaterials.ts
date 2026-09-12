import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from "three";

function canvas(size: number, height = size) {
  const el = document.createElement("canvas");
  el.width = size;
  el.height = height;
  return { el, ctx: el.getContext("2d")! };
}

function texture(el: HTMLCanvasElement) {
  const map = new CanvasTexture(el);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function woodTexture() {
  const { el, ctx } = canvas(512);
  ctx.fillStyle = "#604334";
  ctx.fillRect(0, 0, 512, 512);
  for (let n = 0; n < 390; n++) {
    const y = n * 1.45;
    ctx.strokeStyle = n % 3 ? "rgba(24,13,6,.11)" : "rgba(209,165,111,.14)";
    ctx.lineWidth = n % 7 === 0 ? 2 : .6;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const wave = Math.sin(x * .015 + n * .19) * 3.3 + Math.sin(x * .048 + n) * .8;
      if (x === 0) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  const map = texture(el);
  map.wrapS = map.wrapT = RepeatWrapping;
  return map;
}

export function dialTexture(label: string) {
  const { el, ctx } = canvas(512);
  ctx.fillStyle = "#f0e5cc";
  ctx.fillRect(0, 0, 512, 512);
  ctx.translate(256, 256);
  ctx.strokeStyle = "#67503a";
  ctx.lineWidth = 1.2;
  [222, 207].forEach((r) => { ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * .78, Math.PI * 2.22); ctx.stroke(); });
  for (let i = 0; i <= 50; i++) {
    const angle = -.75 * Math.PI + i / 50 * Math.PI * 1.5;
    ctx.save();
    ctx.rotate(angle);
    ctx.lineWidth = i % 5 === 0 ? 3 : 1.2;
    ctx.beginPath(); ctx.moveTo(0, -205); ctx.lineTo(0, i % 5 === 0 ? -175 : -191); ctx.stroke();
    if (i % 5 === 0) {
      ctx.textAlign = "center";
      ctx.font = "22px Georgia";
      ctx.fillStyle = "#67503a";
      ctx.fillText(String(i * 2), 0, -148);
    }
    ctx.restore();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#5c4734";
  ctx.font = "19px Georgia";
  ctx.fillText("FLYBRAIN LABORATORIES", 0, -65);
  ctx.font = "bold 25px Georgia";
  ctx.fillText(label.toUpperCase(), 0, 89);
  ctx.font = "italic 21px Georgia";
  ctx.fillText("Calibrated. More or less.", 0, 124);
  ctx.font = "15px Georgia";
  ctx.fillText("No. 001     /     MICROVOLTS", 0, 157);
  return texture(el);
}

export function labelTexture(lines: string[], paper = false) {
  const { el, ctx } = canvas(768, 160);
  ctx.fillStyle = paper ? "#efe3c9" : "#b89a60";
  ctx.fillRect(0, 0, 768, 160);
  ctx.strokeStyle = paper ? "#b9a589" : "#7e6540";
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, 750, 142);
  ctx.fillStyle = "#493724";
  ctx.textAlign = "center";
  const lineHeight = lines.length > 1 ? 48 : 68;
  ctx.font = `${paper ? "italic" : ""} ${lines.length > 1 ? 31 : 38}px Georgia`;
  lines.forEach((line, i) => ctx.fillText(line, 384, 82 + (i - (lines.length - 1) / 2) * lineHeight, 705));
  return texture(el);
}

export function neuronNotes() {
  const { el, ctx } = canvas(512, 640);
  ctx.fillStyle = "#ede0c5"; ctx.fillRect(0, 0, 512, 640);
  ctx.strokeStyle = "#d3c0a0"; ctx.lineWidth = 1;
  for (let y = 105; y < 610; y += 27) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(482, y); ctx.stroke(); }
  ctx.fillStyle = "#6e5940"; ctx.font = "24px Georgia"; ctx.fillText("SPECIMEN: HOUSE FLY", 30, 48);
  ctx.font = "italic 19px Georgia"; ctx.fillText("It appears to understand language.", 30, 82);
  [[173, 220], [305, 387]].forEach(([x, y], j) => {
    ctx.strokeStyle = "#816348"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(x, y, 18, 13, -.5, 0, Math.PI * 2); ctx.stroke();
    for (let n = 0; n < 9; n++) {
      const a = n * Math.PI * 2 / 9;
      const length = 50 + ((n * 17 + j * 11) % 45);
      const xx = x + Math.cos(a) * length, yy = y + Math.sin(a) * length;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + .25) * length * .6, y + Math.sin(a + .25) * length * .6, xx, yy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a + .5) * 22, yy + Math.sin(a + .5) * 22); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a - .45) * 18, yy + Math.sin(a - .45) * 18); ctx.stroke();
    }
  });
  ctx.font = "italic 22px Georgia"; ctx.fillText("Signal in. Words out?", 35, 543);
  ctx.font = "17px Georgia"; ctx.fillText("PLEASE DO NOT DISTURB THE FLY.", 35, 603);
  return texture(el);
}