import events = require('events');
import fs = require('fs');
import request = require('request');

import { PathFormatter } from '../utilities/path-formatter';
// import { UrlParser } from '../utilities/url-parser';
import { FileSegmentation } from '../utilities/file-segmentation';

import { Operation } from './operation';
import { PartialDownload, PartialDownloadRange } from './partial-download';

export class FileOperation implements Operation {
  private readonly emitter: events.EventEmitter = new events.EventEmitter();
  public constructor(private saveDirectory: string, private fileName?: string) {}

  segments: PartialDownload[] = [];

  public start(url: string, contentLength: number, numOfConnections: number, headers?: request.Headers): events.EventEmitter {
    const filePath: string = PathFormatter.format(this.saveDirectory, this.fileName);

    let endCounter: number = 0;

    fs.open(filePath, 'w+', 0o644, (err, fd) => {
      if (err) {
        this.emitter.emit('error', err);
        return;
      }

      const segmentsRange: PartialDownloadRange[] = FileSegmentation.getSegmentsRange(contentLength, numOfConnections);
      let positions: number[] = Array(segmentsRange.length).fill(0);
      let completed: number = 0;

      for (const [index, segmentRange] of segmentsRange.entries()) {
        this.segments[index] = new PartialDownload()
          .start(url, segmentRange, headers)
          .on('error', (error) => {
            this.emitter.emit('error', error);
          })
          .on('data', (data, offset) => {
            positions[index] = offset + data.length;
            completed += data.length;
            fs.write(fd, data, 0, data.length, offset, (error) => {
              if (error) {
                this.emitter.emit('error', error);
              } else {
                this.emitter.emit('data', {
                  completed,
                  positions,
                });
              }
            });
          })
          .on('end', () => {
            if (++endCounter === numOfConnections) {
              fs.close(fd, (error) => {
                if (error) {
                  this.emitter.emit('error', error);
                } else {
                  this.emitter.emit('end', filePath);
                }
              });
            }
          });
      }
    });
    return this.emitter;
  }

  public stop(): void {
    this.segments.forEach((segment) => {
      segment.stop();
    });
  }
}
