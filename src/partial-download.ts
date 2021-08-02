import events from 'events';
import fs from 'fs';
import got from 'got';

import { AcceptRanges } from './accept-ranges';
import Request from 'got/dist/source/core';

export interface PartialDownloadRange {
  readonly start: number;
  readonly end: number;
}

export class PartialDownload extends events.EventEmitter {
  private gotStream: Request;
  private writeStream: fs.WriteStream;
  private isPaused: boolean;
  private startOptions: Array<any>;

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
    this.isPaused = false;

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

    this.gotStream = got
      .stream(url, options)
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

    this.writeStream = fs
      .createWriteStream(filepath, {
        flags: 'a+',
      })
      .on('error', (error) => {
        this.emit('error', error);
      })
      .on('finish', () => {
        setTimeout(() => {
          if (range.start + position === range.end + 1) {
            this.emit('end');
            console.log('Ending');
          } else if (!this.isPaused) {
            this.emit('closed', filesize + position);
          }
        }, 100);
      });
    this.gotStream.pipe(this.writeStream);
    return this;
  }
  public pause() {
    if (!this.isPaused) {
      this.isPaused = true;
      this.closeStreams();
    }
  }
  public resume() {
    if (this.isPaused) {
      const [url, filepath, range, headers] = this.startOptions;
      this.start(url, filepath, range, headers);
    }
  }
  public destroy() {
    this.emit('destroyed');
    this.closeStreams();
  }
  private closeStreams() {
    if (this.gotStream) this.gotStream.destroy();
    if (this.writeStream) this.writeStream.close();
  }
}
