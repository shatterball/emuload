import events from 'events';
import fs from 'fs';
import got from 'got';

import { AcceptRanges } from './accept-ranges';

export interface PartialDownloadRange {
  readonly start: number;
  readonly end: number;
}

export class PartialDownload extends events.EventEmitter {
  private gotStream: any;
  private writeStream: fs.WriteStream;
  private isPaused: boolean;
  private isDestroyed: boolean;
  startOptions: Array<any>;

  constructor() {
    super();
    this.isDestroyed = false;
  }
  public start(
    url: string,
    filepath: string,
    range: PartialDownloadRange,
    headers?: Object
  ): PartialDownload {
    let filesize: number = 0;
    let startPosition;
    let position = 0;

    this.startOptions = [url, filepath, range, headers];

    if (fs.existsSync(filepath)) {
      filesize = fs.statSync(filepath).size;
      if (startPosition + filesize > range.end + 1) {
        fs.truncateSync(filepath);
        startPosition = range.start;
      } else if (startPosition === range.end + 1) this.emit('end');
      else {
        startPosition = range.start + filesize;
      }
    } else startPosition = range.start;

    const options = new Object({
      retry: 0,
      headers: {
        ...headers,
        Range: `${AcceptRanges.Bytes}=${startPosition}-${range.end}`,
      },
    });

    if (range.end - startPosition - 1 > 0) {
      this.writeStream = fs.createWriteStream(filepath, {
        flags: 'a+',
      });
      this.gotStream = got.stream(url, options);

      this.gotStream
        .on('downloadProgress', ({ transferred }) => {
          position = filesize + transferred;
          this.emit('data', position);
        })
        .on('error', (error) => {
          if (error.message.includes('503')) {
            this.isPaused = true;
            this.emit('closed', filesize);
          } else {
            this.emit('error', error);
          }
        });

      this.writeStream
        .on('error', (error) => {
          this.emit('error', error);
        })
        .on('finish', () => {
          if (range.start + position < range.end + 1) {
            if (this.isDestroyed) {
              this.emit('destroyed');
            }
          } else if (range.start + position > range.end + 1) {
            this.emit('closed');
          } else {
            this.emit('end');
          }
        });
      this.gotStream.pipe(this.writeStream);
    }
    return this;
  }
  public pause() {
    if (this.gotStream && !this.isPaused) {
      this.isPaused = true;
      this.closeStreams();
    }
  }
  public resume() {
    if (!this.isDestroyed)
      if (this.isPaused) {
        const [url, filepath, range, headers] = this.startOptions;
        this.isPaused = false;
        this.start(url, filepath, range, headers);
      }
  }
  public destroy() {
    if (this.gotStream) {
      this.isDestroyed = true;
      this.closeStreams();
    }
  }
  private closeStreams() {
    this.gotStream.destroy();
    this.writeStream.close();
  }
}
