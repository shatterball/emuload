import events = require('events');
import request = require('request');
import fs = require('fs');

import { AcceptRanges } from './accept-ranges';

export interface PartialDownloadRange {
  readonly start: number;
  readonly end: number;
}

export class PartialDownload extends events.EventEmitter {
  request: request.Request;
  headers: request.Headers;
  range: PartialDownloadRange;
  index: number;
  startPosition: number;
  position: number;
  url: string;
  filepath: string;

  constructor(index: number) {
    super();
    this.index = index;
  }

  public start(
    url: string,
    filepath: string,
    range: PartialDownloadRange,
    headers?: request.Headers
  ): PartialDownload {
    const options: request.CoreOptions = {};
    const writeStream: fs.WriteStream = fs.createWriteStream(this.filepath, { flags: 'a+' });

    this.startPosition = range.start;
    this.url = url;
    this.filepath = filepath;
    this.headers = headers;
    this.range = range;

    if (fs.existsSync(this.filepath)) {
      this.startPosition += fs.statSync(this.filepath).size;
      if (this.startPosition > range.end + 1) {
        this.emit('error', 'Thread corrupted');
      } else if (this.startPosition === range.end + 1) {
        setImmediate(() => {
          this.emit('end');
        });
      }
    }

    options.headers = headers || {};
    options.headers.Range = `${AcceptRanges.Bytes}=${this.startPosition}-${range.end}`;

    if (range.end - this.startPosition - 1 > 0) {
      this.position = this.startPosition;
      this.request = request
        .get(this.url, options)

        .on('error', (err) => {
          console.log('PartialDownload Error');
          this.emit('error', err);
        })

        .on('data', (data) => {
          writeStream.write(data, () => {
            this.position += data.length;
            this.emit('data', this.position, data.length, this.index);
          });
        })

        .on('end', () => {
          this.emit('end');
          writeStream.close();
        });
    }
    return this;
  }
  public stop() {
    this.request.abort();
  }
}
