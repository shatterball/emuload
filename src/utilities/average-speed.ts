export class AverageSpeed {
  speedArray: number[] = [];
  prevComplete: number = 0;
  prevTime: number = 0;
  index: number = 0;
  sampleCount: number;

  constructor(sampleCount?: number) {
    this.sampleCount = sampleCount || 4;
  }

  public getAvgSpeed(completed: number) {
    const time: number = Date.now();
    let speed: number = 0;

    if (this.prevTime !== 0 && this.prevComplete !== 0) {
      const deltaT = (time - this.prevTime) / 1000;
      const deltaC = completed - this.prevComplete;
      speed = deltaC / deltaT;
    }

    if (this.speedArray.length > 0) {
      speed = (this.speedArray.reduce((s, a) => s + a) + speed) / (this.speedArray.length + 1);
    }

    this.speedArray[this.index] = speed;
    this.index++;
    this.prevTime = time;
    this.prevComplete = completed;

    if (this.index > this.sampleCount - 1) {
      this.index = this.index - this.sampleCount;
    }
    return speed;
  }
}
