export class PoseAIClient {
  constructor({
    endpoint = "http://127.0.0.1:8000/v1/predict-window",
    windowFrames = 96,
    strideFrames = 4,
  } = {}) {
    this.endpoint = endpoint;
    this.windowFrames = windowFrames;
    this.strideFrames = strideFrames;
    this.landmarks = [];
    this.timestamps = [];
    this.frameCount = 0;
    this.pending = false;
  }

  async push(mediaPipeLandmarks, timestampSeconds = performance.now() / 1000) {
    const frame = mediaPipeLandmarks.map(({ x, y, z, visibility = 1 }) => [
      x,
      y,
      z,
      visibility,
    ]);
    this.landmarks.push(frame);
    this.timestamps.push(timestampSeconds);
    this.landmarks = this.landmarks.slice(-this.windowFrames);
    this.timestamps = this.timestamps.slice(-this.windowFrames);
    this.frameCount += 1;

    if (
      this.pending ||
      this.landmarks.length < this.windowFrames ||
      this.frameCount % this.strideFrames !== 0
    ) {
      return null;
    }

    this.pending = true;
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landmarks: this.landmarks,
          timestamps: this.timestamps,
        }),
      });
      if (!response.ok) throw new Error(`Pose AI request failed: ${response.status}`);
      return await response.json();
    } finally {
      this.pending = false;
    }
  }

  reset() {
    this.landmarks = [];
    this.timestamps = [];
    this.frameCount = 0;
  }
}
