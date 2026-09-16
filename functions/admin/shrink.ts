// Browser-side photo shrinking for the admin uploaders.
//
// Photographers deliver 20–50 MB, 40–60 megapixel JPEGs. The site never shows
// anything wider than 2560 px, so all but a few percent of those pixels are
// thrown away eventually — the only question is where. Doing it HERE, in the
// owner's browser before upload, means:
//
//   • the upload is a few hundred KB instead of 50 MB over hotel wifi;
//   • nothing on the server has to hold or decode a 60 MP image (a Pages
//     Function has neither the memory nor an image codec for it);
//   • the owner sees, and frames, exactly what will be uploaded.
//
// Quality is the part that needs care. A canvas asked to shrink an image by 4×
// or more in ONE drawImage samples it rather than averaging it, and fine detail
// — fabric, foliage, a brick wall — breaks up into jagged moiré. Safari and
// Firefox are the worst at it. So every big reduction here is done in halves,
// each step at most 2×, which gives every browser a clean result.
//
// Exposed as window.ZAHARA_SHRINK, injected as its own <script> ahead of the
// page script on /admin/images (the photo editor) and /admin/content (the
// popup photo).

export const SHRINK_JS = String.raw`
window.ZAHARA_SHRINK = (function () {
  // iOS Safari refuses to allocate a canvas larger than ~16.7 megapixels and
  // silently draws nothing into one. Keep every intermediate canvas under it.
  var MAX_CANVAS_AREA = 16000000;

  function canvasOf(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function smooth(g) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
  }

  /** Load a File, Blob or URL into a decoded <img>. The browser applies the
   *  photo's EXIF orientation, so naturalWidth/Height are the upright size. */
  function loadImage(source) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      var url = typeof source === 'string' ? source : URL.createObjectURL(source);
      im.crossOrigin = 'anonymous';
      im.onload = function () {
        if (typeof source !== 'string') URL.revokeObjectURL(url);
        resolve(im);
      };
      im.onerror = function () {
        if (typeof source !== 'string') URL.revokeObjectURL(url);
        reject(new Error('This browser could not open that image.'));
      };
      im.src = url;
    });
  }

  /** Halve an image until one more drawImage would shrink it by at most 2× to
   *  reach the target ratio (target pixels per source pixel). Returns the smallest
   *  step that is still at least 2× the target, and its size. The source is
   *  returned untouched when no halving is needed. */
  function stepDown(el, w, h, ratio) {
    var src = el, cw = w, ch = h;
    // The first step may have to be bigger than a half to fit a canvas at all.
    while (ratio * w / cw < 0.5 && cw > 1 && ch > 1) {
      var f = 0.5;
      while ((cw * f) * (ch * f) > MAX_CANVAS_AREA) f /= 2;
      if (ratio * w / (cw * f) > 1) break;          // never go below the target
      var c = canvasOf(cw * f, ch * f);
      var g = c.getContext('2d');
      smooth(g);
      g.drawImage(src, 0, 0, c.width, c.height);
      src = c; cw = c.width; ch = c.height;
    }
    return { el: src, w: cw, h: ch };
  }

  /** A canvas of exactly outW × outH holding the whole image, shrunk well. */
  function resample(el, w, h, outW, outH) {
    var step = stepDown(el, w, h, outW / w);
    var c = canvasOf(outW, outH);
    var g = c.getContext('2d');
    smooth(g);
    g.drawImage(step.el, 0, 0, c.width, c.height);
    return c;
  }

  /** The size that fits inside maxEdge on the long side, never enlarging. */
  function fitWithin(w, h, maxEdge) {
    var k = Math.min(1, maxEdge / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), k: k };
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not prepare the photo.')); }, type, quality);
    });
  }

  /** Make a file ready to upload as-is: shrunk to maxEdge on the long side and
   *  re-encoded, unless it is already small enough in both pixels and bytes —
   *  then the original goes, untouched, so a file that needed nothing loses
   *  nothing. PNGs stay PNG (they are usually graphics with text, which JPEG
   *  smears); everything else becomes a JPEG. */
  async function prepareFile(file, opts) {
    var maxEdge  = opts.maxEdge;
    var maxBytes = opts.maxBytes;
    var im = await loadImage(file);
    var nw = im.naturalWidth, nh = im.naturalHeight;
    if (Math.max(nw, nh) <= maxEdge && file.size <= maxBytes) {
      return { blob: file, w: nw, h: nh, fromW: nw, fromH: nh, changed: false };
    }
    var size = fitWithin(nw, nh, maxEdge);
    var c = resample(im, nw, nh, size.w, size.h);
    var png = file.type === 'image/png';
    var blob = await toBlob(c, png ? 'image/png' : 'image/jpeg', png ? undefined : (opts.quality || 0.88));
    return { blob: blob, w: size.w, h: size.h, fromW: nw, fromH: nh, changed: true };
  }

  function mb(bytes) { return (Math.round(bytes / 1024 / 1024 * 10) / 10) + ' MB'; }

  return {
    loadImage: loadImage, stepDown: stepDown, resample: resample, fitWithin: fitWithin,
    toBlob: toBlob, prepareFile: prepareFile, mb: mb,
  };
})();
`;
