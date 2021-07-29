import events = require('events');
import fs = require('fs');
import { promises as fsp } from 'fs';
import path = require('path');
import multistream = require('multistream');

import { Validation } from './utilities/validation';
import throttle from 'lodash.throttle';

import { AcceptRanges } from './accept-ranges';
import { RequestMetadata, RequestQuery } from './partial-request-query';
import { PartialDownloadRange, PartialDownload } from './partial-download';
import { UrlParser } from './utilities/url-parser';
import { FileSegmentation } from './utilities/file-segmentation';
import { AverageSpeed } from './utilities/average-speed';

import { Headers } from 'request';

interface Options {
  numOfConnections?: number;
  saveDirectory?: string;
  fileName?: string;
  headers?: Headers;
  throttleRate?: number;
}

interface DownloadMetadata {
  url: string;
  saveDirectory: string;
  filename: string;
  filesize: number;
  progress: number;
  speed: number;
  threads: number;
  complete: number;
  positions: number[];
  segmentsRange: PartialDownloadRange[];
  partFiles: string[];
}

export interface DownloadInterface {
  start(url: string, options?: Options): DownloadInterface;
}

export class Download extends events.EventEmitter implements DownloadInterface {
  private static readonly SINGLE_CONNECTION: number = 1;
  private THROTTLE_RATE: number = 100;

  private info: DownloadMetadata;
  private partialDownloads: PartialDownload[];

  start(url: string, options?: Options): Download {
    const validationError: Error = this.validateInputs(url, options);
    if (options.throttleRate) this.THROTTLE_RATE = options.throttleRate;
    if (validationError) {
      this.emit('error', validationError);
    }
    const fileName: string = options.fileName ? options.fileName : UrlParser.getFilename(url);
    const filepath: string = path.join(options.saveDirectory, fileName);
    const metaFile: string = filepath + '.json';
    try {
      this.info = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      this.startDownload(filepath, metaFile);
    } catch (error) {
      RequestQuery.getMetadata(url, options.headers)
        .then((metadata) => {
          const metadataError: Error = this.validateMetadata(url, metadata);
          if (metadataError) {
            this.emit('error', metadataError);
          }
          if (metadata.acceptRanges !== AcceptRanges.Bytes) {
            options.numOfConnections = Download.SINGLE_CONNECTION;
          }
          const partFiles = Array(options.numOfConnections)
            .fill(filepath)
            .map((f: string, i: number) => f + '.part.' + i.toString());
          this.info = {
            url,
            saveDirectory: options.saveDirectory,
            filename: fileName,
            filesize: metadata.contentLength,
            progress: 0,
            speed: 0,
            threads: options.numOfConnections,
            complete: 0,
            positions: [],
            segmentsRange: FileSegmentation.getSegmentsRange(
              metadata.contentLength,
              options.numOfConnections
            ),
            partFiles,
          };
          this.emit('data', this.info);
          this.startDownload(filepath, metaFile);
        })
        .catch((error) => {
          this.emit('error', error);
        });
    }
    return this;
  }

  private startDownload(filepath: string, metaFile: string): void {
    let endCounter: number = 0;
    let overloadQueue: number[] = [];
    const avgSpeed: AverageSpeed = new AverageSpeed();
    const update = () => {
      this.info.speed = avgSpeed.getAvgSpeed(this.info.complete);
      this.info.progress = (this.info.complete / this.info.filesize) * 100;
      fsp.writeFile(filepath + '.json', JSON.stringify(this.info, null, 4), {
        flag: 'w+',
        encoding: 'utf8',
      });
      this.emit('data', this.info);
    };
    const update_t = throttle(update, this.THROTTLE_RATE, { leading: true });

    this.partialDownloads = this.info.segmentsRange.map(
      (segmentRange: PartialDownloadRange, index: number) => {
        return new PartialDownload(this.info.url, this.info.partFiles[index], segmentRange)
          .start()
          .on('data', (position, len) => {
            this.info.complete += len;
            this.info.positions[index] = position;
            update_t();
          })
          .on('closed', (len) => {
            overloadQueue.push(index);
            this.info.complete -= len;
          })
          .on('end', () => {
            if (overloadQueue.length > 0) {
              this.partialDownloads[overloadQueue.shift()].resume();
            }
            if (++endCounter === this.info.threads) {
              setTimeout(() => {
                update();
                this.emit('end', filepath);
                this.mergeFiles(this.info.partFiles, filepath).then((flag) => {
                  if (flag) {
                    fs.unlinkSync(metaFile);
                    this.info.partFiles.forEach((part) => {
                      fs.unlinkSync(part);
                    });
                  }
                });
              }, this.THROTTLE_RATE);
            }
          })
          .on('error', (error) => this.emit('error', error));
      }
    );
  }

  stop() {
    this.partialDownloads.forEach((part) => {
      part.stop();
    });
  }
  resume() {
    this.partialDownloads.forEach((part) => {
      part.resume();
    });
  }

  mergeFiles(partFiles, filepath) {
    console.log('Rebuilding file');
    if (fs.existsSync(filepath)) {
      filepath = filepath + '_';
    }
    var output = fs.createWriteStream(filepath);
    var inputList = partFiles.map((path) => {
      return fs.createReadStream(path);
    });
    return new Promise((resolve, reject) => {
      var multiStream = new multistream(inputList);
      multiStream.pipe(output);
      multiStream.on('end', () => {
        output.close();
        resolve(true);
      });
      multiStream.on('error', () => {
        output.close();
        reject(false);
      });
    });
  }

  private validateInputs(url: string, options: Options): Error {
    if (!Validation.isUrl(url)) {
      return new Error('Invalid URL provided');
    }

    if (!Validation.isValidNumberOfConnections(options.numOfConnections)) {
      return new Error('Invalid number of connections provided');
    }

    if (options.saveDirectory && !Validation.isDirectory(options.saveDirectory)) {
      return new Error('Invalid save directory provided');
    }

    if (options.fileName && !Validation.isValidFileName(options.fileName)) {
      return new Error('Invalid file name provided');
    }

    return null;
  }

  private validateMetadata(url: string, metadata: RequestMetadata): Error {
    if (isNaN(metadata.contentLength)) {
      return new Error(`Failed to query Content-Length of ${url}`);
    }

    return null;
  }
}
