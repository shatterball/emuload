import events from 'events';
import request from 'request';
import fs from 'fs';

import { AcceptRanges } from './accept-ranges';

export interface PartialDownloadRange {
  readonly start: number;
  readonly end: number;
}

export class PartialDownload extends events.EventEmitter {
  request: request.Request;
  headers: request.Headers;
  range: PartialDownloadRange;

  startPosition: number;
  position: number;
  url: string;
  filepath: string;

  constructor(
    url: string,
    filepath: string,
    range: PartialDownloadRange,
    headers?: request.Headers
  ) {
    super();
    this.url = url;
    this.filepath = filepath;
    this.headers = headers;
    this.range = range;
  }

  public start(): PartialDownload {
    const options: request.CoreOptions = {};

    if (fs.existsSync(this.filepath)) {
      this.startPosition = this.range.start + fs.statSync(this.filepath).size;
      if (this.startPosition > this.range.end + 1) {
        this.emit('error', 'Thread corrupted');
      } else if (this.startPosition === this.range.end + 1) {
        setImmediate(() => {
          this.emit('end');
        });
      }
    } else this.startPosition = this.range.start;
    const writeStream: fs.WriteStream = fs.createWriteStream(this.filepath, {
      flags: 'a+',
    });

    options.headers = this.headers || {};
    options.headers.Range = `${AcceptRanges.Bytes}=${this.startPosition}-${this.range.end}`;

    if (this.range.end - this.startPosition - 1 > 0) {
      this.position = this.startPosition;
      this.request = request
        .get(this.url, options)
        .on('error', (err) => {
          if (err.message !== 'aborted') this.emit('error', err);
          else writeStream.close();
        })
        .on('data', (data) => {
          writeStream.write(data, () => {
            this.position += data.length;
            this.emit('data', this.position, data.length);
          });
        })
        .on('end', () => {
          setTimeout(() => {
            if (this.position < this.range.end) {
              this.emit('closed', this.position - this.range.start);
              fs.truncateSync(this.filepath);
            } else if (this.position === this.range.end + 1) {
              this.emit('end');
            }
            writeStream.close();
          }, 100);
        });
    }
    return this;
  }
  public stop() {
    this.request.abort();
  }
  public resume() {
    this.start();
  }
}
