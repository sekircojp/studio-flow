/**
 * ロゴ画像の余白を切り落とす（ブラウザ側で行う）
 * ────────────────────────────────────────────────
 * ロゴの元データは、正方形の中に横長の文字を置いて、上下に大きな余白が
 * 空いていることが多い。SNS のアイコン用に作った画像を流用するためで、
 * これをそのまま並べると、高さを揃えたときに文字が線にしか見えなくなる。
 *
 * 余白（四隅と同じ色、または透明）を外側から削って、中身だけを残す。
 *
 * ★ サーバーではなくブラウザで行う。
 *   画像処理の依存を増やさずに済み、アップロード前に結果を見せられる。
 *   見た目の調整であって、正しさに関わる処理ではない。
 *
 * ★ SVG は触らない。
 *   ベクタなので拡大しても潰れず、ラスタ化すると品質が落ちるだけ。
 */

/** 余白とみなす色の許容差（0〜255）。JPEG の圧縮でにじむぶんを吸収する */
const COLOR_TOLERANCE = 12;

/** 透明とみなすアルファ値 */
const ALPHA_THRESHOLD = 8;

/** 出力する画像の最長辺。画面表示にこれ以上は要らない */
const MAX_SIDE = 1024;

export type TrimResult = {
  file: File;
  /** 実際に切り落としたか。しなかった場合は元のファイルをそのまま返す */
  trimmed: boolean;
};

export async function trimImageMargins(file: File): Promise<TrimResult> {
  if (file.type === "image/svg+xml") return { file, trimmed: false };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // 読めない画像はそのまま送る。判断はサーバーとバケット側の制限に任せる
    return { file, trimmed: false };
  }

  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { file, trimmed: false };
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, width, height);
  const at = (x: number, y: number) => (y * width + x) * 4;

  // 四隅を見て、余白が「透明」なのか「べた塗り」なのかを決める
  const corners = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1),
  ];
  const transparentBg = corners.every((i) => data[i + 3] < ALPHA_THRESHOLD);

  // べた塗りの余白なら、左上の色を余白の色とみなす
  const br = data[corners[0]];
  const bg = data[corners[0] + 1];
  const bb = data[corners[0] + 2];

  // 四隅の色がばらばらなら、余白ではなく絵柄。切らずに返す
  if (!transparentBg) {
    const sameCorners = corners.every(
      (i) =>
        Math.abs(data[i] - br) <= COLOR_TOLERANCE &&
        Math.abs(data[i + 1] - bg) <= COLOR_TOLERANCE &&
        Math.abs(data[i + 2] - bb) <= COLOR_TOLERANCE &&
        data[i + 3] >= ALPHA_THRESHOLD,
    );
    if (!sameCorners) return { file, trimmed: false };
  }

  const isBackground = (x: number, y: number) => {
    const i = at(x, y);
    if (transparentBg) return data[i + 3] < ALPHA_THRESHOLD;
    return (
      Math.abs(data[i] - br) <= COLOR_TOLERANCE &&
      Math.abs(data[i + 1] - bg) <= COLOR_TOLERANCE &&
      Math.abs(data[i + 2] - bb) <= COLOR_TOLERANCE
    );
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  const rowIsBackground = (y: number) => {
    for (let x = left; x <= right; x++) if (!isBackground(x, y)) return false;
    return true;
  };
  const colIsBackground = (x: number) => {
    for (let y = top; y <= bottom; y++) if (!isBackground(x, y)) return false;
    return true;
  };

  while (top < bottom && rowIsBackground(top)) top++;
  while (bottom > top && rowIsBackground(bottom)) bottom--;
  while (left < right && colIsBackground(left)) left++;
  while (right > left && colIsBackground(right)) right--;

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;

  // 全面が余白（＝真っ白な画像）だった場合は触らない
  if (cropW < 2 || cropH < 2) return { file, trimmed: false };

  // ほとんど削るものが無いなら、作り直さずに元を使う
  const shrink = (cropW * cropH) / (width * height);
  if (shrink > 0.98) return { file, trimmed: false };

  // 画面表示に必要な大きさまで縮める
  const scale = Math.min(1, MAX_SIDE / Math.max(cropW, cropH));
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d");
  if (!outCtx) return { file, trimmed: false };
  outCtx.drawImage(canvas, left, top, cropW, cropH, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/png"),
  );
  if (!blob) return { file, trimmed: false };

  // 透過を保つため、切り取った結果は常に PNG にする
  const name = file.name.replace(/\.[^.]+$/, "") + ".png";
  return {
    file: new File([blob], name, { type: "image/png" }),
    trimmed: true,
  };
}
