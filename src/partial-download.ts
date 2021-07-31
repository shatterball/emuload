import events from 'events';
import fs from 'fs';
import got from 'got';

import { AcceptRanges } from './accept-ranges';

export interface PartialDownloadRange {
  readonly start: number;
  readonly end: number;
}

export class PartialDownload extends events.EventEmitter {
  gotStream;
  writeStream: fs.WriteStream;

  public start(
    url: string,
    filepath: string,
    range: PartialDownloadRange,
    headers?: Object
  ): PartialDownload {
    let filesize: number = 0;
    let startPosition;
    let position = 0;

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
          this.emit('error', error);
        });

      this.writeStream
        .on('error', (error) => {
          this.emit('error', error);
        })
        .on('finish', () => {
          if (range.start + position < range.end + 1) {
            fs.truncateSync(filepath);
            this.emit('closed');
          } else this.emit('end');
        });
      this.gotStream.pipe(this.writeStream);
    }
    return this;
  }
  public pause() {
    this.gotStream.pause();
  }
  public resume() {
    this.gotStream.resume();
  }
  public destroy() {
    this.gotStream.destroy();
    this.writeStream.close();
  }
}
