import type { Worker } from 'tesseract.js';

async function prepareImage(file: File, signal: AbortSignal) {
  // createImageBitmap respects camera orientation. Scale before reading pixels to
  // bound memory on large phone images and give small text more useful pixels.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    signal.throwIfAborted();
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(2600 / longest, Math.max(1, 1600 / longest));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('image-unreadable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { bitmap.close(); }
}

function enhance(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = Math.round(pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114);
    pixels.data[i] = gray;
    histogram[gray]++;
  }
  const target = canvas.width * canvas.height * .02;
  let low = 0, high = 255, count = 0;
  while (low < 254 && (count += histogram[low]) < target) low++;
  count = 0;
  while (high > low + 1 && (count += histogram[high]) < target) high--;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.max(0, Math.min(255, (pixels.data[i] - low) * 255 / Math.max(32, high - low)));
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function imageBytes(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('image-unreadable')), 'image/png');
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  signal.throwIfAborted();
  return bytes;
}

export async function readImage(file: File, options: {
  signal: AbortSignal; product: boolean;
  onProgress(progress: number, retry: boolean): void;
}) {
  let worker: Worker | undefined;
  let retry = false;
  let closed = false;
  let rejectJob: (reason: unknown) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => { rejectJob = reject; });
  const cancel = () => rejectJob(new DOMException('Reading cancelled', 'AbortError'));
  options.signal.addEventListener('abort', cancel, { once: true });
  const timer = window.setTimeout(() => rejectJob(new Error('Reading timed out')), 90_000);
  const work = async () => {
    const [canvas, { createWorker, PSM }, { default: workerPath }] = await Promise.all([
      prepareImage(file, options.signal), import('tesseract.js'), import('tesseract.js/dist/worker.min.js?url'),
    ]);
    options.signal.throwIfAborted();
    const created = await createWorker('eng', 1, {
      workerPath, workerBlobURL: false,
      errorHandler: error => rejectJob(error),
      logger: event => {
        if (!closed && !options.signal.aborted && event.status === 'recognizing text')
          options.onProgress(event.progress, retry);
      },
    });
    worker = created;
    // Initialization can finish after cancellation. Never leave that worker live.
    if (closed) { await created.terminate(); options.signal.throwIfAborted(); throw new Error('Reading ended'); }
    options.signal.throwIfAborted();
    await worker.setParameters({ tessedit_pageseg_mode: options.product ? PSM.SPARSE_TEXT : PSM.AUTO, user_defined_dpi: '300' });
    // Encode before calling Tesseract. Its canvas loader otherwise finishes after
    // cancellation and can post a job to a worker that has already terminated.
    const firstImage = await imageBytes(canvas, options.signal);
    const first = (await worker.recognize(firstImage, { rotateAuto: true })).data;
    options.signal.throwIfAborted();
    let best = first;
    if (!first.text.trim() || first.confidence < 80) {
      retry = true;
      options.onProgress(0, true);
      const secondImage = await imageBytes(enhance(canvas), options.signal);
      const second = (await worker.recognize(secondImage, { rotateAuto: true })).data;
      options.signal.throwIfAborted();
      if (second.text.trim() && (!first.text.trim() || second.confidence > first.confidence)) best = second;
    }
    return { text: best.text.trim(), confidence: best.confidence };
  };
  try {
    options.signal.throwIfAborted();
    return await Promise.race([work(), interrupted]);
  } finally {
    closed = true;
    window.clearTimeout(timer);
    options.signal.removeEventListener('abort', cancel);
    if (worker) await worker.terminate();
  }
}
