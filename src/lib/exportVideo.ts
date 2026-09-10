import type { ChangeStatus, ExplorerCommit } from "../types";

type ExportProgress = {
  current: number;
  total: number;
  percent: number;
};

const width = 1280;
const height = 720;
const frameMs = 420;

const statusColor = (status: ChangeStatus): string => {
  switch (status) {
    case "added":
      return "#54d47d";
    case "modified":
      return "#68a7ff";
    case "deleted":
      return "#ff6b6b";
    case "renamed":
      return "#f5b84b";
  }
};

const mimeType = (): string => {
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return "video/webm;codecs=vp9";
  }

  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    return "video/webm;codecs=vp8";
  }

  return "video/webm";
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const drawFrame = (
  context: CanvasRenderingContext2D,
  commit: ExplorerCommit,
  index: number,
  total: number,
): void => {
  context.fillStyle = "#0b0f14";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#3bd6c6";
  context.font = "700 28px Inter, system-ui, sans-serif";
  context.fillText("Git History Explorer", 56, 62);

  context.fillStyle = "#8fa1b3";
  context.font = "500 22px Inter, system-ui, sans-serif";
  context.fillText(`${index + 1} of ${total} commits`, 56, 102);

  context.fillStyle = "#f7fbff";
  context.font = "800 42px Inter, system-ui, sans-serif";
  context.fillText(commit.message, 56, 180, 1000);

  context.fillStyle = "#8fa1b3";
  context.font = "500 24px Inter, system-ui, sans-serif";
  context.fillText(
    `${commit.author}  ${new Date(commit.date).toLocaleDateString()}  ${commit.shortHash}`,
    56,
    224,
  );

  const barWidth = 1120;
  const barLeft = 56;
  const barTop = 606;
  const progress = total <= 1 ? 1 : index / (total - 1);
  context.fillStyle = "#273545";
  context.fillRect(barLeft, barTop, barWidth, 10);
  context.fillStyle = "#3bd6c6";
  context.fillRect(barLeft, barTop, barWidth * progress, 10);

  const rows = commit.changes.slice(0, 8);
  rows.forEach((change, rowIndex) => {
    const y = 292 + rowIndex * 38;
    context.fillStyle = statusColor(change.status);
    context.fillRect(56, y - 22, 10, 28);
    context.fillStyle = "#d9e2ec";
    context.font = "700 22px Inter, system-ui, sans-serif";
    context.fillText(change.path, 82, y, 820);
  });
};

export const canRecordWebm = (): boolean =>
  typeof MediaRecorder !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  "captureStream" in HTMLCanvasElement.prototype;

export const recordTimelineWebm = async (
  commits: ExplorerCommit[],
  onProgress: (progress: ExportProgress) => void,
): Promise<Blob> => {
  if (commits.length === 0) {
    throw new Error("No commits available to export.");
  }

  if (!canRecordWebm()) {
    throw new Error("WebM recording is not supported in this browser.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is not available.");
  }

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mimeType() });
  const chunks: BlobPart[] = [];
  let isAborted = false;

  const cleanupStream = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => {
      isAborted = true;
      cleanupStream();
      reject(new Error("WebM recorder failed."));
    };
    recorder.onstop = () => {
      cleanupStream();
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
  });

  recorder.start();

  try {
    for (const [index, commit] of commits.entries()) {
      if (isAborted || recorder.state === "inactive") {
        break;
      }
      drawFrame(context, commit, index, commits.length);
      onProgress({
        current: index + 1,
        total: commits.length,
        percent: Math.round(((index + 1) / commits.length) * 100),
      });
      await wait(frameMs);
    }
  } catch (error) {
    isAborted = true;
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    cleanupStream();
    throw error;
  }

  if (recorder.state !== "inactive") {
    recorder.stop();
  }
  return done;
};
