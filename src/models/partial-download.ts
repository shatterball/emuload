import events = require('events');
import request = require('request');

import { AcceptRanges } from './accept-ranges';

export interface PartialDownloadRange {
  readonly start: number;
  readonly end: number;
}

export class PartialDownload extends events.EventEmitter {
  r: request.Request;
  public start(url: string, range: PartialDownloadRange, headers?: request.Headers): PartialDownload {
    const options: request.CoreOptions = {};

    options.headers = headers || {};
    options.headers.Range = `${AcceptRanges.Bytes}=${range.start}-${range.end}`;

    let offset: number = range.start;
    this.r = request
      .get(url, options)
      .on('error', (err) => {
        this.emit('error', err);
      })
      .on('data', (data) => {
        this.emit('data', data, offset);
        offset += data.length;
      })
      .on('end', () => {
        this.emit('end');
      });
    return this;
  }
  public stop() {
    this.r.abort();
  }
}
