export class AverageSpeed {
  private speedArray: number[] = [];
  private prevComplete: number = 0;
  private prevTime: number = 0;
  private sampleCount = 8;

  constructor(sampleCount?: number) {
    this.sampleCount = sampleCount || this.sampleCount;
  }

  public getAvgSpeed(completed: number) {
    const time: number = Date.now();
    let speed: number = 0;

    if (this.prevTime !== 0 && this.prevComplete !== 0) {
      const deltaT = (time - this.prevTime) / 1000;
      const deltaC = completed - this.prevComplete;
      speed = deltaC / deltaT;
    }

    if (speed !== Infinity && speed >= 0) {
      this.speedArray.push(speed);
    }

    if (this.speedArray.length > 1) {
      speed = this.speedArray.reduce((s, a) => s + a) / this.speedArray.length;
    }

    this.prevTime = time;
    this.prevComplete = completed;

    if (this.speedArray.length > this.sampleCount) {
      this.speedArray.shift();
    }
    return speed;
  }
}
