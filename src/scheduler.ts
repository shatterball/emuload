import { SchedulerOptions } from './interfaces';

import { Download, DownloadStatus } from './download';

export class Scheduler {
  options: SchedulerOptions;
  taskQueue: Array<Download>;
  constructor(options: SchedulerOptions) {
    this.options = options;
  }
}
