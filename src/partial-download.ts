import events from 'events';
import fs from 'fs';
import got from 'got';

import { AcceptRanges } from './accept-ranges';

export interface PartialDownloadRange {
  readonly start: number;
  readonly end: number;
}

export class PartialDownload extends events.EventEmitter {
  private gotStream;
  private writeStream: fs.WriteStream;
  private noTruncate: boolean;
  private isPaused: boolean;
  private isDestroyed: boolean;
  startOptions: Array<any>;

  constructor() {
    super();
    this.noTruncate = false;
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
      startPosition = range.start + filesize;

      if (startPosition > range.end + 1) fs.truncateSync(filepath);

      if (startPosition === range.end + 1) this.emit('end');
    } else startPosition = range.start;

    const options = new Object({
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
            // if (filesize > 0) fs.truncateSync(filepath);
            this.isPaused = true;
            this.emit('closed', filesize);
            console.log('[partial-download.ts]Closing');
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
      this.noTruncate = true;
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
      this.noTruncate = false;
      this.closeStreams();
    }
  }
  private closeStreams() {
    this.gotStream.destroy();
    this.writeStream.close();
  }
}
