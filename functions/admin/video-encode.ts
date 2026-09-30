// Browser-side video normalising for the admin uploader.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// A restaurant's video comes from a phone, a photographer, or an editor, and
// it is almost never in the one format that plays everywhere. The two that
// broke this site were not exotic:
//
//   • an iPhone records HEVC by default. Safari plays it; Chrome, Edge and
//     Firefox do not.
//   • a Mac screen recording or a web export is often VP9 in WebM. Chrome
//     plays it; no iPhone does.
//
// Both upload without complaint and both play perfectly for whoever uploaded
// them, which is exactly why they reach the live site. Telling the owner to go
// and re-export with ffmpeg is not a fix — it is a fix they cannot perform.
//
// So the browser does it. This is the same bargain shrink.ts already makes for
// 50 MP photographs: the machine that has the file, and a codec, and nothing
// else to do, is the right machine to prepare it on.
//
// ── How ─────────────────────────────────────────────────────────────────────
//
// Decoding is the <video> element's job. It demuxes and decodes anything this
// browser can play, which is the widest decoder available and needs no library
// — frames are lifted straight off it with `new VideoFrame(videoEl)` as it
// plays, one per `requestVideoFrameCallback`.
//
// Encoding is WebCodecs' `VideoEncoder`, asked for H.264 in `avc` format,
// which hands back length-prefixed NAL units and an `avcC` description — the
// exact two things an MP4 sample table wants.
//
// Muxing is mux() below: a deliberately small MP4 writer for ONE video track
// with no audio, which is all a muted background loop can ever be. Every
// sample is buffered before anything is written, so `moov` goes in FRONT of
// `mdat` by construction. There is no non-faststart file this can produce.
//
// ── What it will not do ─────────────────────────────────────────────────────
//
// If this browser cannot DECODE the file, nothing here can help: there are no
// frames to re-encode. That is the one case the uploader still refuses, and it
// is rare, because the owner picked the file on a machine that could play it.
// Everything else — wrong codec, wrong container, index in the wrong place,
// bitrate far past what a background loop needs — is repaired silently.
//
// Exposed as window.ZAHARA_VIDEO, injected as its own <script> ahead of the
// page script on /admin/images.

export const VIDEO_JS = String.raw`
window.ZAHARA_VIDEO = (function () {

  // ── Targets ───────────────────────────────────────────────────────────────
  // A slot video is atmosphere behind text, under a gradient, usually moving
  // slowly. It does not need to be a master.
  var MAX_EDGE   = 1920;   // longest side; a 4K master is pointlessly big here
  var MAX_FPS    = 30;     // a ceiling, not a target — see rateFor() below
  // Bits per pixel per second. 0.025 was borrowed from an "ffmpeg -crf 26
  // -preset slow" result, and handing that budget to a BROWSER encoder was the
  // mistake: x264 at preset slow spends seconds per frame looking for savings
  // this one cannot spend milliseconds on, so the same bitrate buys visibly
  // less. At 0.025 a 1080x1920 clip came out at 1.5 Mbps and looked like 480p.
  var BPP        = 0.045;  // ~2.8 Mbps at 1080x1920x30
  var MIN_RATE   = 800000;
  var MAX_RATE   = 6000000;
  var TIMESCALE  = 90000;

  function supported() {
    return typeof window.VideoEncoder === 'function' &&
           typeof window.VideoFrame === 'function' &&
           typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function';
  }

  // ── Reading the file well enough to know whether it needs work ────────────
  // The same three questions the server asks (see functions/admin/images/
  // video.ts → inspect), asked here so the answer is known before 40 MB move.
  function fourcc(b, at) {
    if (at + 4 > b.length) return '';
    return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  }
  function find(b, code, from, to) {
    var a = code.charCodeAt(0), c = code.charCodeAt(1), d = code.charCodeAt(2), e = code.charCodeAt(3);
    for (var i = from; i + 3 < to; i++) {
      if (b[i] === a && b[i + 1] === c && b[i + 2] === d && b[i + 3] === e) return i;
    }
    return -1;
  }

  /** What is actually in this file. Mirrors the server's inspect(). */
  function facts(bytes) {
    var f = { container: null, hevc: false, h264: false, prores: false, faststart: true };
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
      f.container = 'webm';
      return f;
    }
    if (fourcc(bytes, 4) !== 'ftyp') return f;
    var size = Math.min(((bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0), 256);
    var brands = [];
    for (var at = 8; at + 4 <= size && at + 4 <= bytes.length; at += 4) brands.push(fourcc(bytes, at));
    f.container = brands[0] === 'qt  ' ? 'mov' : 'mp4';

    var WIN  = Math.min(bytes.length, 512 * 1024);
    var tail = Math.max(0, bytes.length - 512 * 1024);
    var moov = find(bytes, 'moov', 0, WIN);
    var mdat = find(bytes, 'mdat', 0, WIN);
    f.faststart = mdat < 0 || (moov >= 0 && moov < mdat);

    var spans = [[0, WIN], [tail, bytes.length]];
    for (var s = 0; s < spans.length; s++) {
      var lo = spans[s][0], hi = spans[s][1];
      if (find(bytes, 'hvc1', lo, hi) >= 0 || find(bytes, 'hev1', lo, hi) >= 0) f.hevc = true;
      if (find(bytes, 'avc1', lo, hi) >= 0 || find(bytes, 'avcC', lo, hi) >= 0) f.h264 = true;
      if (find(bytes, 'apcn', lo, hi) >= 0 || find(bytes, 'apch', lo, hi) >= 0 ||
          find(bytes, 'apcs', lo, hi) >= 0 || find(bytes, 'ap4h', lo, hi) >= 0) f.prores = true;
    }
    if (brands.indexOf('hvc1') >= 0 || brands.indexOf('hev1') >= 0) f.hevc = true;
    return f;
  }

  /** Why this file is not fit to serve, in words, or null if it is. */
  function problem(f) {
    if (!f.container) return 'that file does not look like a video';
    if (f.container === 'webm')            return 'it is a WebM, which no iPhone can play';
    if (f.prores && !f.h264)               return 'it is a ProRes editing master, which no browser can play';
    if (f.hevc && !f.h264)                 return 'it is HEVC (H.265), which Chrome, Edge and Firefox cannot play';
    if (f.container === 'mov' && !f.h264)  return 'it is a QuickTime file in a codec browsers may not play';
    if (!f.faststart)                      return 'its index sits at the end, so it cannot start until the whole file has downloaded';
    return null;
  }

  function read(file, bytes) {
    return file.slice(0, Math.min(bytes, file.size)).arrayBuffer();
  }

  /** Everything known about a file before deciding what to do with it. */
  async function examine(file) {
    // Head and tail, which between them hold ftyp, moov and the codec code.
    var head = new Uint8Array(await read(file, 512 * 1024));
    var whole = head;
    if (file.size > 512 * 1024) {
      var tailBuf = new Uint8Array(await file.slice(Math.max(0, file.size - 512 * 1024)).arrayBuffer());
      whole = new Uint8Array(head.length + tailBuf.length);
      whole.set(head, 0);
      whole.set(tailBuf, head.length);
      // find() spans are computed against the real length, so pad the gap out
      // of the way by lying about size only where it is safe: facts() only
      // looks at [0, 512K) and [len-512K, len).
    }
    var f = facts(whole.length === head.length ? head : whole);
    return { facts: f, problem: problem(f) };
  }

  // ── Decode: frames off a <video>, which demuxes anything this browser plays ─
  function openVideo(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      v.onloadedmetadata = function () {
        if (!v.videoWidth || !v.videoHeight) {
          URL.revokeObjectURL(url);
          reject(new Error('This browser cannot decode that video.'));
          return;
        }
        resolve({ el: v, url: url });
      };
      v.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('This browser cannot decode that video.'));
      };
    });
  }

  /** Even dimensions, capped to MAX_EDGE. H.264 requires even width/height. */
  function targetSize(w, h) {
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    var tw = Math.max(2, Math.round(w * scale / 2) * 2);
    var th = Math.max(2, Math.round(h * scale / 2) * 2);
    return { w: tw, h: th };
  }

  // ── A very small MP4 writer ───────────────────────────────────────────────
  // One video track, no audio, one chunk, moov before mdat. That is the whole
  // brief, and keeping it to that is what makes it short enough to trust.
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >>> 8) & 255, n & 255]; }
  function str(s) { var o = []; for (var i = 0; i < s.length; i++) o.push(s.charCodeAt(i) & 255); return o; }

  function box(type) {
    var body = [];
    for (var i = 1; i < arguments.length; i++) {
      var p = arguments[i];
      for (var j = 0; j < p.length; j++) body.push(p[j]);
    }
    return u32(body.length + 8).concat(str(type), body);
  }
  function fullBox(type, version, flags) {
    var rest = Array.prototype.slice.call(arguments, 3);
    return box.apply(null, [type, [version].concat([(flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255])].concat(rest));
  }

  /** Build the file. "samples" are {data: Uint8Array, duration, keyframe}. */
  function mux(samples, cfg) {
    var count = samples.length;
    var total = 0, i;
    for (i = 0; i < count; i++) total += samples[i].data.length;

    var duration = 0;
    for (i = 0; i < count; i++) duration += samples[i].duration;

    // stts — run-length encoded sample durations.
    var runs = [];
    for (i = 0; i < count; i++) {
      var d = samples[i].duration;
      if (runs.length && runs[runs.length - 1].d === d) runs[runs.length - 1].n++;
      else runs.push({ n: 1, d: d });
    }
    var sttsBody = u32(runs.length);
    for (i = 0; i < runs.length; i++) sttsBody = sttsBody.concat(u32(runs[i].n), u32(runs[i].d));

    // stss — which samples are sync points (1-based). Omitted entirely when
    // every sample is one, which is what the spec means by "all sync".
    var syncs = [];
    for (i = 0; i < count; i++) if (samples[i].keyframe) syncs.push(i + 1);
    var stss = syncs.length === count ? [] : (function () {
      var b = u32(syncs.length);
      for (var k = 0; k < syncs.length; k++) b = b.concat(u32(syncs[k]));
      return fullBox('stss', 0, 0, b);
    })();

    // stsz — every sample's size.
    var stszBody = u32(0).concat(u32(count));
    for (i = 0; i < count; i++) stszBody = stszBody.concat(u32(samples[i].data.length));

    var avcC   = box('avcC', cfg.description);
    var pasp   = box('pasp', u32(1).concat(u32(1)));
    var avc1   = box('avc1',
      [0, 0, 0, 0, 0, 0], u16(1),                       // reserved, data_reference_index
      u16(0), u16(0), u32(0), u32(0), u32(0),           // pre_defined, reserved
      u16(cfg.width), u16(cfg.height),
      u32(0x00480000), u32(0x00480000),                 // 72 dpi
      u32(0), u16(1),
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  // compressorname (32 bytes)
       0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      u16(0x0018), u16(0xFFFF),
      avcC, pasp);

    var stbl = function (chunkOffset) {
      return box('stbl',
        fullBox('stsd', 0, 0, u32(1).concat(avc1)),
        fullBox('stts', 0, 0, sttsBody),
        stss,
        fullBox('stsc', 0, 0, u32(1).concat(u32(1), u32(count), u32(1))),
        fullBox('stsz', 0, 0, stszBody),
        fullBox('stco', 0, 0, u32(1).concat(u32(chunkOffset))));
    };

    var mvhd = fullBox('mvhd', 0, 0,
      u32(0), u32(0), u32(TIMESCALE), u32(duration),
      u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
      u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000),
      u32(0), u32(0), u32(0), u32(0), u32(0), u32(0),
      u32(2));
    var tkhd = fullBox('tkhd', 0, 3,
      u32(0), u32(0), u32(1), u32(0), u32(duration),
      u32(0), u32(0), u16(0), u16(0), u16(0), u16(0),
      u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000),
      u32(cfg.width * 65536), u32(cfg.height * 65536));
    var mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(duration), u16(0x55C4), u16(0));
    var hdlr = fullBox('hdlr', 0, 0, u32(0), str('vide'), u32(0), u32(0), u32(0), str('VideoHandler\x00'));
    var dinf = box('dinf', fullBox('dref', 0, 0, u32(1).concat(fullBox('url ', 0, 1))));

    var build = function (chunkOffset) {
      var minf = box('minf', fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf, stbl(chunkOffset));
      var mdia = box('mdia', mdhd, hdlr, minf);
      var trak = box('trak', tkhd, mdia);
      return box('moov', mvhd, trak);
    };

    var ftyp = box('ftyp', str('isom'), u32(512), str('isomiso2avc1mp41'));
    // Two passes: the chunk offset depends on moov's size, and moov's size
    // depends on the chunk offset. The second build is the same length as the
    // first (a u32 either way), so one repeat settles it.
    var moovLen = build(0).length;
    var moov    = build(ftyp.length + moovLen + 8);
    if (moov.length !== moovLen) moov = build(ftyp.length + moov.length + 8);

    var out = new Uint8Array(ftyp.length + moov.length + 8 + total);
    var p = 0, k;
    for (k = 0; k < ftyp.length; k++) out[p++] = ftyp[k];
    for (k = 0; k < moov.length; k++) out[p++] = moov[k];
    var mdatHeader = u32(total + 8).concat(str('mdat'));
    for (k = 0; k < mdatHeader.length; k++) out[p++] = mdatHeader[k];
    for (i = 0; i < count; i++) { out.set(samples[i].data, p); p += samples[i].data.length; }
    return out;
  }

  // ── The whole job ─────────────────────────────────────────────────────────
  /** Re-encode "file" to a faststart H.264 MP4. "onProgress(fraction)" is
   *  called as it goes. Resolves to a File, or throws with a plain-words
   *  reason the caller can show. */
  async function transcode(file, onProgress) {
    if (!supported()) throw new Error('This browser cannot convert video.');

    var opened = await openVideo(file);
    var v = opened.el;
    var size = targetSize(v.videoWidth, v.videoHeight);
    var duration = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;

    var bitrate = Math.round(Math.min(MAX_RATE, Math.max(MIN_RATE, size.w * size.h * MAX_FPS * BPP)));
    var config = {
      codec: 'avc1.640028',
      width: size.w, height: size.h,
      bitrate: bitrate,
      framerate: MAX_FPS,
      avc: { format: 'avc' },
      // 'realtime' tunes for a video call: no lookahead, and a rate control
      // that must hit its target every single frame. On a hero loop that is
      // the wrong trade twice over — it spends bits evenly instead of where
      // the picture needs them, and it silently dropped chunks under load
      // (435 emitted for 450 encoded). 'quality' keeps every chunk and looks
      // markedly better at the same bitrate.
      latencyMode: 'quality',
    };
    var check = await VideoEncoder.isConfigSupported(config);
    if (!check || !check.supported) {
      // Baseline profile is accepted by every implementation that has H.264.
      config.codec = 'avc1.42001F';
      check = await VideoEncoder.isConfigSupported(config);
      if (!check || !check.supported) throw new Error('This browser cannot encode H.264.');
    }

    var samples = [];
    var cfgOut  = null;
    var failure = null;

    var encoder = new VideoEncoder({
      output: function (chunk, meta) {
        if (meta && meta.decoderConfig && meta.decoderConfig.description && !cfgOut) {
          cfgOut = new Uint8Array(meta.decoderConfig.description);
        }
        var data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        // Timestamp now, duration later. Durations CANNOT be worked out here
        // from the gap to the previous chunk: an encoder is free to emit in
        // decode order, which with B-frames is not presentation order, and
        // measuring the gap between out-of-order neighbours scrambled the
        // middle of the clip while leaving its total length right — a montage
        // came back with its cuts in the wrong places. They are computed in
        // one pass after flush(), from the sorted timestamps.
        samples.push({ data: data, ts: chunk.timestamp, keyframe: chunk.type === 'key' });
      },
      error: function (e) { failure = e; },
    });
    encoder.configure(config);

    // ── Pull frames as the clip plays ───────────────────────────────────────
    // requestVideoFrameCallback fires once per frame actually presented, which
    // is the browser telling us precisely when a new picture exists. Nothing
    // is sampled twice and nothing is invented.
    var done = false;
    var frames = 0;

    // ── Which presented frames to keep ──────────────────────────────────────
    // This used to be "skip anything closer than 1/30s to the last frame we
    // kept", which quietly threw away a THIRD of every clip: the browser
    // presents frames a hair under the nominal spacing, so a 30 fps source was
    // sampled at about 20 and the result visibly stuttered.
    //
    // The rule now is a schedule, not a gap. "nextWanted" advances by exactly
    // one output frame each time a frame is taken, so it cannot drift, and a
    // source at or below the ceiling is never thinned at all — only genuinely
    // faster footage (a 60 fps phone clip) is halved.
    var minGap = 1000000 / MAX_FPS;
    var nextWanted = -Infinity;

    await new Promise(function (resolve, reject) {
      function onFrame(now, meta) {
        if (done) return;
        if (failure) { done = true; reject(failure); return; }
        var ts = Math.round((meta && meta.mediaTime != null ? meta.mediaTime : v.currentTime) * 1000000);
        // Half a frame of slack, so a presented frame that lands a few
        // microseconds early still counts as the one we were waiting for.
        if (ts >= nextWanted - minGap / 2) {
          if (nextWanted === -Infinity) nextWanted = ts;
          nextWanted += minGap;
          try {
            var frame = new VideoFrame(v, { timestamp: ts });
            // A keyframe every 2s keeps looping and seeking cheap without
            // costing much size on slow-moving footage.
            encoder.encode(frame, { keyFrame: frames % (MAX_FPS * 2) === 0 });
            frame.close();
            frames++;
          } catch (e) { done = true; reject(e); return; }
        }
        if (duration && onProgress) onProgress(Math.min(0.98, v.currentTime / duration));
        v.requestVideoFrameCallback(onFrame);
      }
      v.onended = function () { if (!done) { done = true; resolve(); } };
      v.onerror  = function () { if (!done) { done = true; reject(new Error('The video stopped part-way through.')); } };
      v.requestVideoFrameCallback(onFrame);
      v.play().catch(function (e) { done = true; reject(e); });
    });

    await encoder.flush();
    encoder.close();
    URL.revokeObjectURL(opened.url);
    if (failure) throw failure;
    if (!samples.length) throw new Error('No frames could be read from that video.');
    if (!cfgOut) throw new Error('The encoder did not describe its output.');

    // ── Durations, in presentation order ──────────────────────────────────
    // Sorting by timestamp is what makes this safe whatever order the encoder
    // emitted in. Each sample lasts until the next one starts; the last keeps
    // the nominal frame duration, having nothing after it to measure against.
    samples.sort(function (a, b) { return a.ts - b.ts; });
    var nominal = Math.round(TIMESCALE / MAX_FPS);
    for (var n = 0; n < samples.length; n++) {
      samples[n].duration = n + 1 < samples.length
        ? Math.max(1, Math.round((samples[n + 1].ts - samples[n].ts) * TIMESCALE / 1000000))
        : nominal;
    }

    var bytes = mux(samples, { description: cfgOut, width: size.w, height: size.h });
    if (onProgress) onProgress(1);

    var name = (file.name || 'video').replace(/\.[^.]+$/, '') + '.mp4';
    return new File([bytes], name, { type: 'video/mp4' });
  }

  return {
    supported: supported,
    examine: examine,
    transcode: transcode,
    facts: facts,
    problem: problem,
  };
})();
`;
