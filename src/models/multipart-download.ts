import events = require('events');

import { Validation } from '../utilities/validation';
import throttle from 'lodash.throttle';

import { AcceptRanges } from './accept-ranges';
import { Operation } from './operation';
import { FileOperation } from './file-operation';
import { PartialRequestMetadata, PartialRequestQuery } from './partial-request-query';
import { PartialDownloadRange } from './partial-download';
import { StartOptions } from './start-options';
import { UrlParser } from '../utilities/url-parser';
import { FileSegmentation } from '../utilities/file-segmentation';
import { AverageSpeed } from '../utilities/average-speed';

export interface MultipartOperation {
  start(url: string, options?: StartOptions): MultipartOperation;
}

export class MultipartDownload extends events.EventEmitter implements MultipartOperation {
  private static readonly SINGLE_CONNECTION: number = 1;

  public start(
    url: string,
    options: StartOptions = { numOfConnections: MultipartDownload.SINGLE_CONNECTION }
  ): MultipartDownload {
    options.numOfConnections = options.numOfConnections || MultipartDownload.SINGLE_CONNECTION;

    const validationError: Error = this.validateInputs(url, options);
    if (validationError) {
      this.emit('error', validationError);
    }

    this.execute(url, options);

    return this;
  }

  private execute(url: string, options: StartOptions): void {
    new PartialRequestQuery()
      .getMetadata(url, options.headers)
      .then((metadata) => {
        const fileName: string = options.fileName ? options.fileName : UrlParser.getFilename(url);
        const throttleRate: number = options.throttle || 100;

        const metadataError: Error = this.validateMetadata(url, metadata);
        if (metadataError) {
          this.emit('error', metadataError);
        }
        if (metadata.acceptRanges !== AcceptRanges.Bytes) {
          options.numOfConnections = MultipartDownload.SINGLE_CONNECTION;
        }

        const operation: Operation = new FileOperation(options.saveDirectory, fileName);
        const avgSpeed: AverageSpeed = new AverageSpeed();
        const segmentsRange: PartialDownloadRange[] = FileSegmentation.getSegmentsRange(
          metadata.contentLength,
          options.numOfConnections
        );

        operation
          .start(url, metadata.contentLength, options.numOfConnections, options.headers)
          .on('error', (err) => {
            this.emit('error', err);
          })
          .on(
            'data',
            throttle((data) => {
              const meta: Object = {
                url,
                saveDirectory: options.saveDirectory,
                filename: fileName,
                filesize: metadata.contentLength,
                progress: (data.completed / metadata.contentLength) * 100,
                speed: avgSpeed.getAvgSpeed(data.completed),
                completed: data.completed,
                segmentsRange,
                positions: data.positions,
              };
              this.emit('data', meta);
            }, throttleRate)
          )
          .on('end', (output) => {
            this.emit('end', output);
          });
      })
      .catch((err) => {
        this.emit('error', err);
      });
  }

  private validateInputs(url: string, options: StartOptions): Error {
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

  private validateMetadata(url: string, metadata: PartialRequestMetadata): Error {
    if (isNaN(metadata.contentLength)) {
      return new Error(`Failed to query Content-Length of ${url}`);
    }

    return null;
  }
}
