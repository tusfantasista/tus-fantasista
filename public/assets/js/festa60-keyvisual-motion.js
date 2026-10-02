/* QR-free leaflet artwork, enhanced only with published Photo Chronicle photographs. */
(() => {
  "use strict";

  const stage = document.querySelector("[data-keyvisual-motion]");
  if (!stage) return;
  const artwork = stage.querySelector(".keyvisual-artwork");
  const layers = stage.querySelector(".keyvisual-motion-layers");
  const toggle = stage.querySelector("[data-keyvisual-toggle]");
  const photoList = stage.querySelector("[data-keyvisual-current-photos]");
  const canvases = {
    upper: stage.querySelector('[data-keyvisual-canvas="upper"]'),
    lower: stage.querySelector('[data-keyvisual-canvas="lower"]')
  };
  if (!artwork || !layers || !toggle || !canvases.upper || !canvases.lower) return;

  // Window coordinates are the original, unaltered 1054 x 1492 master.
  // The original picture occupies x=.36, width=792.99 on a 793.7008pt A4 slide.
  const WINDOWS = [
  {
    "quad": [
      [
        511,
        154
      ],
      [
        529,
        151
      ],
      [
        529,
        173
      ],
      [
        511,
        179
      ]
    ],
    "initial": "/assets/img/archive/1966-1976/1107646942686761.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        482,
        160
      ],
      [
        506,
        155
      ],
      [
        506,
        181
      ],
      [
        482,
        191
      ]
    ],
    "initial": "/assets/img/archive/1977-1986/1107676216017167.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        446,
        173
      ],
      [
        477,
        162
      ],
      [
        477,
        192
      ],
      [
        446,
        202
      ]
    ],
    "initial": "/assets/img/archive/1987-1996/1107692106015578.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        406,
        187
      ],
      [
        441,
        175
      ],
      [
        442,
        205
      ],
      [
        408,
        222
      ]
    ],
    "initial": "/assets/img/archive/1997-2006/1107722262679229.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        361,
        208
      ],
      [
        400,
        191
      ],
      [
        402,
        225
      ],
      [
        364,
        246
      ]
    ],
    "initial": "/assets/img/archive/1997-2006/1107720266012762.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        317,
        236
      ],
      [
        355,
        211
      ],
      [
        358,
        249
      ],
      [
        320,
        273
      ]
    ],
    "initial": "/assets/img/archive/2007-2016/1107756196009169.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        267,
        260
      ],
      [
        311,
        245
      ],
      [
        313,
        272
      ],
      [
        276,
        308
      ]
    ],
    "initial": "/assets/img/archive/2007-2016/1107758536008935.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        214,
        307
      ],
      [
        260,
        269
      ],
      [
        270,
        312
      ],
      [
        231,
        349
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/2041479566139060.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        169,
        353
      ],
      [
        208,
        314
      ],
      [
        226,
        355
      ],
      [
        193,
        403
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/776513109355428.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        137,
        404
      ],
      [
        162,
        362
      ],
      [
        187,
        409
      ],
      [
        167,
        451
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2023-group.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        124,
        428
      ],
      [
        166,
        455
      ],
      [
        156,
        499
      ],
      [
        114,
        472
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2024-group.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        112,
        482
      ],
      [
        154,
        509
      ],
      [
        155,
        555
      ],
      [
        124,
        532
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2025-group.webp",
    "layer": "upper"
  },
  {
    "quad": [
      [
        188,
        911
      ],
      [
        222,
        892
      ],
      [
        245,
        958
      ],
      [
        212,
        979
      ]
    ],
    "initial": "/assets/img/archive/1987-1996/1107692106015578.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        231,
        887
      ],
      [
        289,
        869
      ],
      [
        310,
        937
      ],
      [
        254,
        953
      ]
    ],
    "initial": "/assets/img/archive/1997-2006/1107722262679229.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        301,
        866
      ],
      [
        379,
        855
      ],
      [
        397,
        922
      ],
      [
        320,
        933
      ]
    ],
    "initial": "/assets/img/archive/1997-2006/1107720266012762.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        400,
        853
      ],
      [
        490,
        851
      ],
      [
        490,
        918
      ],
      [
        407,
        921
      ]
    ],
    "initial": "/assets/img/archive/2007-2016/1107756196009169.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        502,
        852
      ],
      [
        582,
        854
      ],
      [
        582,
        926
      ],
      [
        504,
        920
      ]
    ],
    "initial": "/assets/img/archive/2007-2016/1107758536008935.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        598,
        854
      ],
      [
        671,
        858
      ],
      [
        664,
        935
      ],
      [
        596,
        929
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/2041479566139060.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        682,
        860
      ],
      [
        755,
        867
      ],
      [
        745,
        945
      ],
      [
        676,
        938
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/776513109355428.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        764,
        870
      ],
      [
        832,
        884
      ],
      [
        818,
        960
      ],
      [
        756,
        948
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2023-group.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        842,
        888
      ],
      [
        893,
        908
      ],
      [
        879,
        981
      ],
      [
        829,
        965
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2024-group.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        903,
        914
      ],
      [
        920,
        935
      ],
      [
        909,
        967
      ],
      [
        888,
        981
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2025-group.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        185,
        1016
      ],
      [
        242,
        1042
      ],
      [
        252,
        1146
      ],
      [
        191,
        1116
      ]
    ],
    "initial": "/assets/img/archive/1997-2006/1107720266012762.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        251,
        1044
      ],
      [
        344,
        1062
      ],
      [
        352,
        1169
      ],
      [
        264,
        1151
      ]
    ],
    "initial": "/assets/img/archive/2007-2016/1107756196009169.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        358,
        1063
      ],
      [
        452,
        1068
      ],
      [
        458,
        1177
      ],
      [
        364,
        1171
      ]
    ],
    "initial": "/assets/img/archive/2007-2016/1107758536008935.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        467,
        1068
      ],
      [
        568,
        1064
      ],
      [
        571,
        1173
      ],
      [
        472,
        1178
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/2041479566139060.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        583,
        1064
      ],
      [
        689,
        1057
      ],
      [
        689,
        1160
      ],
      [
        585,
        1172
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/776513109355428.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        705,
        1054
      ],
      [
        800,
        1044
      ],
      [
        794,
        1134
      ],
      [
        704,
        1150
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2023-group.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        811,
        1041
      ],
      [
        876,
        1020
      ],
      [
        868,
        1103
      ],
      [
        808,
        1128
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2024-group.webp",
    "layer": "lower"
  },
  {
    "quad": [
      [
        887,
        1017
      ],
      [
        920,
        1002
      ],
      [
        917,
        1069
      ],
      [
        879,
        1096
      ]
    ],
    "initial": "/assets/img/archive/2017-2026/festa-2025-group.webp",
    "layer": "lower"
  }
];
  const SOURCE_WIDTH = 1054;
  const SOURCE_HEIGHT = 1492;
  const SLIDE_WIDTH = 793.7008;
  const PHOTO_LEFT = .36 / SLIDE_WIDTH;
  const PHOTO_WIDTH = 792.99 / SLIDE_WIDTH;
  const ASPECT = 2263 / 1600;
  const INTERVAL = 12000;
  const FADE_DURATION = 1500;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const sourceUrl = new URL(stage.dataset.photoSource, window.location.href);
  const siteRootUrl = new URL("../../", sourceUrl);
  const contexts = { upper: canvases.upper.getContext("2d"), lower: canvases.lower.getContext("2d") };
  if (!contexts.upper || !contexts.lower) return;

  let ready = false;
  let failed = false;
  let loading = false;
  let busy = false;
  let running = false;
  let userPaused = false;
  let inView = false;
  let timer = 0;
  let frameRequest = 0;
  let resizeTimer = 0;
  let resizeRevision = 0;
  let surfaceWidth = 0;
  let surfaceHeight = 0;
  let photos = [];
  let pools = [];
  let poolCursors = [];
  let current = [];
  let transition = null;
  let cycle = 0;
  const imageCache = new Map();
  const patchCache = new Map();

  stage.dataset.motionReady = "false";
  stage.dataset.motionState = "static";

  function photoUrl(value) {
    return new URL(String(value).replace(/^\.\.\/assets\//, "assets/"), siteRootUrl).href;
  }

  function cacheTrim(cache, maximum) {
    while (cache.size > maximum) cache.delete(cache.keys().next().value);
  }

  function loadPhoto(photo) {
    // Chronicle thumbnails may be cropped. Keep the full photograph's composition.
    const url = photoUrl(photo.image || photo.thumbnail);
    if (imageCache.has(url)) {
      const result = imageCache.get(url);
      imageCache.delete(url);
      imageCache.set(url, result);
      return result;
    }
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error("Empty Chronicle image"));
      img.onerror = () => reject(new Error("Unavailable Chronicle image"));
      img.src = url;
    });
    imageCache.set(url, promise);
    cacheTrim(imageCache, 18);
    promise.catch(() => {
      if (imageCache.get(url) === promise) imageCache.delete(url);
    });
    return promise;
  }

  function loadLayer(img) {
    return new Promise((resolve, reject) => {
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) return reject(new Error("Empty film layer"));
        if (typeof img.decode === "function") img.decode().then(() => resolve(img), reject);
        else resolve(img);
      };
      img.onerror = () => reject(new Error("Unavailable film layer"));
      img.src = img.dataset.src;
    });
  }

  function normalizedPoint(point, width, height) {
    return [
      (PHOTO_LEFT + point[0] / SOURCE_WIDTH * PHOTO_WIDTH) * width,
      point[1] / SOURCE_HEIGHT * height
    ];
  }

  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  // Map a flat, undistorted photo plane into the master's perspective window.
  function quadProjector(points) {
    const [p0, p1, p2, p3] = points;
    const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0];
    const dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1];
    const dx3 = p0[0] - p1[0] + p2[0] - p3[0];
    const dy3 = p0[1] - p1[1] + p2[1] - p3[1];
    const determinant = dx1 * dy2 - dx2 * dy1;
    let g = 0, h = 0;
    if (Math.abs(dx3) + Math.abs(dy3) > 1e-8 && Math.abs(determinant) > 1e-8) {
      g = (dx3 * dy2 - dx2 * dy3) / determinant;
      h = (dx1 * dy3 - dx3 * dy1) / determinant;
    }
    const a = p1[0] - p0[0] + g * p1[0];
    const b = p3[0] - p0[0] + h * p3[0];
    const d = p1[1] - p0[1] + g * p1[1];
    const e = p3[1] - p0[1] + h * p3[1];
    return (u, v) => {
      const denominator = g * u + h * v + 1;
      return [(a * u + b * v + p0[0]) / denominator, (d * u + e * v + p0[1]) / denominator];
    };
  }

  function drawTriangle(ctx, texture, source, destination) {
    const [s0, s1, s2] = source, [d0, d1, d2] = destination;
    const determinant = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
    if (Math.abs(determinant) < 1e-8) return;
    const affine = (axis) => [
      (d0[axis] * (s1[1] - s2[1]) + d1[axis] * (s2[1] - s0[1]) + d2[axis] * (s0[1] - s1[1])) / determinant,
      (d0[axis] * (s2[0] - s1[0]) + d1[axis] * (s0[0] - s2[0]) + d2[axis] * (s1[0] - s0[0])) / determinant,
      (d0[axis] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[axis] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[axis] * (s0[0] * s1[1] - s1[0] * s0[1])) / determinant
    ];
    const [a, c, e] = affine(0), [b, d, f] = affine(1);
    // Tiny triangle overlap avoids raster seams; the outer window clip is exact.
    const center = [(d0[0] + d1[0] + d2[0]) / 3, (d0[1] + d1[1] + d2[1]) / 3];
    const expanded = destination.map(point => {
      const radius = Math.max(distance(point, center), 1);
      return [point[0] + (point[0] - center[0]) / radius * .35, point[1] + (point[1] - center[1]) / radius * .35];
    });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...expanded[0]);
    ctx.lineTo(...expanded[1]);
    ctx.lineTo(...expanded[2]);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(texture, 0, 0);
    ctx.restore();
  }

  async function makePatch(index, photo, width, height) {
    const key = index + ":" + photo.photo_id + ":" + width;
    if (patchCache.has(key)) return patchCache.get(key);
    const image = await loadPhoto(photo);
    const quad = WINDOWS[index].quad.map(point => normalizedPoint(point, width, height));
    const left = Math.floor(Math.min(...quad.map(point => point[0]))) - 1;
    const top = Math.floor(Math.min(...quad.map(point => point[1]))) - 1;
    const right = Math.ceil(Math.max(...quad.map(point => point[0]))) + 1;
    const bottom = Math.ceil(Math.max(...quad.map(point => point[1]))) + 1;
    const localQuad = quad.map(point => [point[0] - left, point[1] - top]);
    const patchCanvas = document.createElement("canvas");
    patchCanvas.width = right - left;
    patchCanvas.height = bottom - top;
    const ctx = patchCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    const texture = document.createElement("canvas");
    texture.width = Math.max(2, Math.round((distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2));
    texture.height = Math.max(2, Math.round((distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2));
    const textureCtx = texture.getContext("2d");
    if (!textureCtx) throw new Error("Canvas unavailable");
    textureCtx.fillStyle = "#100d0a";
    textureCtx.fillRect(0, 0, texture.width, texture.height);
    // Contain: keep the original photo's full composition and aspect ratio.
    const scale = Math.min(texture.width / image.naturalWidth, texture.height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale, imageHeight = image.naturalHeight * scale;
    textureCtx.drawImage(image, (texture.width - imageWidth) / 2, (texture.height - imageHeight) / 2, imageWidth, imageHeight);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...localQuad[0]);
    for (let i = 1; i < 4; i++) ctx.lineTo(...localQuad[i]);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#100d0a";
    ctx.fillRect(0, 0, patchCanvas.width, patchCanvas.height);
    const project = quadProjector(localQuad);
    const divisions = width < 800 ? 4 : 6;
    for (let row = 0; row < divisions; row++) {
      for (let column = 0; column < divisions; column++) {
        const u0 = column / divisions, u1 = (column + 1) / divisions;
        const v0 = row / divisions, v1 = (row + 1) / divisions;
        const source = [
          [u0 * texture.width, v0 * texture.height], [u1 * texture.width, v0 * texture.height],
          [u1 * texture.width, v1 * texture.height], [u0 * texture.width, v1 * texture.height]
        ];
        const dest = [project(u0, v0), project(u1, v0), project(u1, v1), project(u0, v1)];
        drawTriangle(ctx, texture, [source[0], source[1], source[2]], [dest[0], dest[1], dest[2]]);
        drawTriangle(ctx, texture, [source[0], source[2], source[3]], [dest[0], dest[2], dest[3]]);
      }
    }
    ctx.restore();
    const patch = { canvas: patchCanvas, left, top, photo };
    patchCache.set(key, patch);
    cacheTrim(patchCache, 90);
    return patch;
  }

  function dimensions() {
    const cssWidth = Math.max(1, artwork.getBoundingClientRect().width);
    stage.style.setProperty("--keyvisual-shift", Math.min(1, 2 * cssWidth / SLIDE_WIDTH).toFixed(3) + "px");
    const width = Math.min(1054, Math.max(480, Math.round(cssWidth * Math.min(window.devicePixelRatio || 1, 2))));
    return { width, height: Math.round(width * ASPECT) };
  }

  function render(progress = transition ? transition.progress : 0) {
    for (const ctx of Object.values(contexts)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, surfaceWidth, surfaceHeight);
      ctx.globalAlpha = 1;
    }
    current.forEach((entry, index) => {
      const ctx = contexts[WINDOWS[index].layer];
      if (!entry.patch) return;
      // Keep an opaque prior image under the fade, so the film's baked image never leaks through.
      ctx.globalAlpha = 1;
      ctx.drawImage(entry.patch.canvas, entry.patch.left, entry.patch.top);
      const next = transition && transition.next[index];
      if (next && next.patch && next.photo.photo_id !== entry.photo.photo_id && progress > 0) {
        ctx.globalAlpha = progress;
        ctx.drawImage(next.patch.canvas, next.patch.left, next.patch.top);
      }
    });
    for (const ctx of Object.values(contexts)) ctx.globalAlpha = 1;
  }

  function describePhotos() {
    if (!photoList) return;
    const fragment = document.createDocumentFragment();
    current.forEach((entry, index) => {
      const item = document.createElement("li");
      item.dataset.photoId = entry.photo.photo_id;
      const description = [entry.photo.alt, entry.photo.caption, entry.photo.album_name].filter(Boolean);
      item.textContent = (index < 12 ? "上部" : "下部") + "フィルム " + (index + 1) + "：" + [...new Set(description)].join("。");
      fragment.append(item);
    });
    photoList.replaceChildren(fragment);
    stage.dataset.currentPhotoCount = String(current.length);
  }

  function loadPools(manifest) {
    const galleryIds = new Set(Array.isArray(manifest.gallery_photo_ids) ? manifest.gallery_photo_ids : []);
    photos = (Array.isArray(manifest.photos) ? manifest.photos : []).filter(photo =>
      photo.publication_status === "published" && galleryIds.has(photo.photo_id) && (photo.thumbnail || photo.image)
    );
    if (!photos.length) throw new Error("No published Chronicle photographs");
    const albums = ["1966-1976", "1977-1986", "1987-1996", "1997-2006", "2007-2016", "2017-2026"];
    pools = albums.map(album => photos.filter(photo => photo.album_slug === album));
    if (pools.some(pool => !pool.length)) throw new Error("Incomplete Chronicle era pools");
    poolCursors = pools.map(() => 0);
    stage.dataset.photoSourceCount = String(photos.length);
    stage.dataset.photoEraCount = String(pools.length);
  }

  function nextPhoto(index, previous) {
    const era = (index + cycle) % pools.length;
    const pool = pools[era];
    let photo = pool[poolCursors[era]++ % pool.length];
    if (photo.photo_id === previous.photo_id && pool.length > 1) photo = pool[poolCursors[era]++ % pool.length];
    return photo;
  }

  function cancelScheduledWork() {
    clearTimeout(timer);
    timer = 0;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    if (transition) transition.lastTimestamp = 0;
  }

  function scheduleNext() {
    if (!running || busy || transition || timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      beginTransition();
    }, INTERVAL);
  }

  async function beginTransition() {
    if (!running || busy || transition) return;
    busy = true;
    const revision = resizeRevision;
    const next = await Promise.all(current.map(async (entry, index) => {
      const photo = nextPhoto(index, entry.photo);
      try {
        return { photo, patch: await makePatch(index, photo, surfaceWidth, surfaceHeight) };
      } catch (_) {
        // A single failed thumbnail retains that window's last successful photo.
        return entry;
      }
    }));
    busy = false;
    if (revision !== resizeRevision || !ready) {
      scheduleNext();
      return;
    }
    cycle++;
    transition = { next, elapsed: 0, lastTimestamp: 0, lastPaint: -Infinity, progress: 0 };
    if (running) frameRequest = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    frameRequest = 0;
    if (!running || !transition) return;
    if (transition.lastTimestamp) transition.elapsed += Math.max(0, timestamp - transition.lastTimestamp);
    transition.lastTimestamp = timestamp;
    const frameInterval = artwork.getBoundingClientRect().width < 480 ? 125 : 1000 / 12;
    if (timestamp - transition.lastPaint >= frameInterval || transition.elapsed >= FADE_DURATION) {
      const linear = Math.min(1, transition.elapsed / FADE_DURATION);
      transition.progress = linear * linear * (3 - 2 * linear);
      transition.lastPaint = timestamp;
      render(transition.progress);
      if (linear >= 1) {
        current = transition.next;
        transition = null;
        render();
        describePhotos();
        scheduleNext();
        return;
      }
    }
    frameRequest = requestAnimationFrame(tick);
  }

  function blockedBySettings() {
    return reducedMotion.matches || Boolean(connection && connection.saveData);
  }

  function syncPlayback() {
    const blocked = blockedBySettings();
    const shouldRun = !blocked && !userPaused && inView && !document.hidden && ready;
    layers.hidden = !ready || blocked;
    toggle.hidden = !ready || blocked;
    toggle.setAttribute("aria-pressed", String(userPaused));
    toggle.textContent = userPaused ? "フィルムの動き・写真切替を再開" : "フィルムの動き・写真切替を停止";
    stage.dataset.motionState = blocked || !ready ? "static" : shouldRun ? "running" : "paused";
    if (!ready && !failed && !loading && !blocked && inView && !document.hidden) initialize();
    if (shouldRun === running) return;
    running = shouldRun;
    if (!running) {
      cancelScheduledWork();
      return;
    }
    if (transition) frameRequest = requestAnimationFrame(tick);
    else scheduleNext();
  }

  async function initialize() {
    loading = true;
    try {
      const [manifest, loadedLayers] = await Promise.all([
        fetch(sourceUrl, { credentials: "same-origin" }).then(response => {
          if (!response.ok) throw new Error("Unavailable Chronicle manifest");
          return response.json();
        }),
        Promise.all([...stage.querySelectorAll("[data-keyvisual-layer]")].map(loadLayer))
      ]);
      const ratio = loadedLayers[0].naturalWidth / loadedLayers[0].naturalHeight;
      if (loadedLayers.some(img => img.naturalWidth !== loadedLayers[0].naturalWidth || img.naturalHeight !== loadedLayers[0].naturalHeight) || Math.abs(ratio - 1 / ASPECT) > .002) {
        throw new Error("Film layer geometry mismatch");
      }
      loadPools(manifest);
      const size = dimensions();
      const initial = WINDOWS.map((window, index) => photos.find(photo =>
        new URL(photoUrl(photo.image)).pathname === window.initial
      ) || pools[index % pools.length][0]);
      current = await Promise.all(initial.map(async (photo, index) => ({
        photo, patch: await makePatch(index, photo, size.width, size.height)
      })));
      surfaceWidth = size.width;
      surfaceHeight = size.height;
      for (const canvas of Object.values(canvases)) {
        canvas.width = surfaceWidth;
        canvas.height = surfaceHeight;
      }
      render();
      describePhotos();
      ready = true;
      stage.dataset.motionReady = "true";
    } catch (_) {
      // No broken collage, partial layer stack, or QR-bearing fallback on any setup error.
      failed = true;
      stage.dataset.motionReady = "false";
      stage.dataset.motionError = "static-fallback";
      layers.hidden = true;
    } finally {
      loading = false;
      syncPlayback();
    }
  }

  async function resizeScene() {
    if (!ready) return;
    const size = dimensions();
    if (size.width === surfaceWidth) return;
    const revision = ++resizeRevision;
    const oldCurrent = current;
    const oldTransition = transition;
    try {
      const [rebuilt, rebuiltNext] = await Promise.all([
        Promise.all(oldCurrent.map(async (entry, index) => ({
          photo: entry.photo, patch: await makePatch(index, entry.photo, size.width, size.height)
        }))),
        oldTransition ? Promise.all(oldTransition.next.map(async (entry, index) => ({
          photo: entry.photo, patch: await makePatch(index, entry.photo, size.width, size.height)
        }))) : Promise.resolve(null)
      ]);
      if (revision !== resizeRevision || current !== oldCurrent || transition !== oldTransition) {
        resizeTimer = window.setTimeout(resizeScene, 150);
        return;
      }
      current = rebuilt;
      if (transition) transition.next = rebuiltNext;
      surfaceWidth = size.width;
      surfaceHeight = size.height;
      for (const canvas of Object.values(canvases)) {
        canvas.width = surfaceWidth;
        canvas.height = surfaceHeight;
      }
      render();
    } catch (_) {
      // Existing canvases remain intact until every replacement patch has loaded.
    }
  }

  toggle.addEventListener("click", () => {
    userPaused = !userPaused;
    syncPlayback();
  });
  document.addEventListener("visibilitychange", syncPlayback);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", syncPlayback);
  else if (reducedMotion.addListener) reducedMotion.addListener(syncPlayback);
  if (connection && connection.addEventListener) connection.addEventListener("change", syncPlayback);

  const updateVisibility = () => {
    const rect = artwork.getBoundingClientRect();
    inView = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    syncPlayback();
  };
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
      syncPlayback();
    }, { threshold: 0 });
    observer.observe(artwork);
  } else {
    window.addEventListener("scroll", updateVisibility, { passive: true });
  }
  const onResize = () => {
    clearTimeout(resizeTimer);
    if (!("IntersectionObserver" in window)) updateVisibility();
    resizeTimer = window.setTimeout(resizeScene, 150);
  };
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(artwork);
  else window.addEventListener("resize", onResize, { passive: true });
  updateVisibility();
})();
