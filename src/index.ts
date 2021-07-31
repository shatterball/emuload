import events from 'events';
import fs, { promises as fsp } from 'fs';
import path from 'path';
import throttle from 'throttleit';

import { Validation } from './utilities/validation';
import { MergeFiles } from './utilities/merge-files';
import { AcceptRanges } from './accept-ranges';
import { RequestMetadata, RequestQuery } from './partial-request-query';
import { PartialDownloadRange, PartialDownload } from './partial-download';
import { UrlParser } from './utilities/url-parser';
import { FileSegmentation } from './utilities/file-segmentation';
import { AverageSpeed } from './utilities/average-speed';
import { Options, DownloadMetadata } from './interfaces';

export enum DownloadStatus {
  removed = 'removed',
  paused = 'paused',
  active = 'active',
  building = 'building',
  complete = 'complete',
}

export class Download extends events.EventEmitter {
  private static readonly SINGLE_CONNECTION: number = 1;
  private THROTTLE_RATE: number = 100;

  private info: DownloadMetadata;
  private partialDownloads: PartialDownload[];
  private metaFile: string;
  private filepath: string;

  start(url: string, options?: Options): Download {
    const validationError: Error = this.validateInputs(url, options);
    if (options.throttleRate) this.THROTTLE_RATE = options.throttleRate;
    if (validationError) {
      this.emit('error', validationError);
    }
    const fileName: string = options.fileName ? options.fileName : UrlParser.getFilename(url);
    this.filepath = path.join(options.saveDirectory, fileName);
    this.metaFile = this.filepath + '.json';
    try {
      this.info = JSON.parse(fs.readFileSync(this.metaFile, 'utf8'));
      this.info.status = DownloadStatus.active;
      this.startDownload();
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
          const segmentsRange = FileSegmentation.getSegmentsRange(
            metadata.contentLength,
            options.numOfConnections
          );
          const partFiles = Array(options.numOfConnections)
            .fill(this.filepath)
            .map((f: string, i: number) => f + '.part.' + i.toString());
          this.info = {
            url,
            saveDirectory: options.saveDirectory,
            filename: fileName,
            filesize: metadata.contentLength,
            status: DownloadStatus.active,
            progress: 0,
            speed: 0,
            complete: 0,
            threads: options.numOfConnections,
            positions: Array(options.numOfConnections).fill(0),
            segmentsRange,
            partFiles,
          };
          this.emit('data', this.info);
          this.startDownload();
        })
        .catch((error) => {
          this.emit('error', error);
        });
    }
    return this;
  }

  private startDownload(): void {
    let endCounter: number = 0;
    let overloadQueue: number[] = [];
    const avgSpeed: AverageSpeed = new AverageSpeed();

    const update = throttle(() => {
      this.info.speed = avgSpeed.getAvgSpeed(this.info.complete);
      this.info.progress = (this.info.complete / this.info.filesize) * 100;
      this.emit('data', this.info);
    }, this.THROTTLE_RATE);

    const onEnd = () => {
      if (overloadQueue.length > 0) {
        this.partialDownloads[overloadQueue.shift()].resume();
      }
      if (++endCounter === this.info.threads) {
        this.info.status = DownloadStatus.building;
        this.emit('data', this.info);
        MergeFiles.merge(this.info.partFiles, this.filepath).then((flag) => {
          this.info.status = DownloadStatus.complete;
          this.emit('data', this.info);
          if (flag) this.deleteFiles();
        });
      }
    };
    const mapPartialDownloads = (segmentRange: PartialDownloadRange, index: number) =>
      new PartialDownload(this.info.url, this.info.partFiles[index], segmentRange)
        .start()
        .on('data', (position, len) => {
          this.info.complete += len;
          this.info.positions[index] = position - this.info.segmentsRange[index].start;
          fsp.writeFile(this.metaFile, JSON.stringify(this.info, null, 4), {
            flag: 'w+',
            encoding: 'utf8',
          });
          update();
        })
        .on('closed', (len) => {
          overloadQueue.push(index);
          this.info.complete -= len;
          this.info.positions[index] = 0;
        })
        .on('end', onEnd)
        .on('error', (error) => this.emit('error', error));

    this.partialDownloads = this.info.segmentsRange.map(mapPartialDownloads);
  }

  stop() {
    this.partialDownloads.forEach((part) => {
      part.stop();
    });
    this.info.status = DownloadStatus.paused;
    this.emit('data', this.info);
  }
  resume() {
    this.partialDownloads.forEach((part) => {
      part.resume();
    });
    this.info.status = DownloadStatus.active;
    this.emit('data', this.info);
  }
  remove() {
    this.stop();
    this.info.status = DownloadStatus.removed;
    this.deleteFiles();
  }
  deleteFiles() {
    setTimeout(() => {
      fs.unlinkSync(this.metaFile);
      this.info.partFiles.forEach((part) => {
        fs.unlinkSync(part);
      });
      this.emit('end');
    }, this.THROTTLE_RATE);
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
