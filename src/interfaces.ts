import { PartialDownloadRange } from './partial-download';
import request from 'request';

export interface Options {
  numOfConnections?: number;
  saveDirectory?: string;
  fileName?: string;
  headers?: request.Headers;
  throttleRate?: number;
}

export interface SchedulerOptions {
  maxActiveDownloads?: number;
  autoStart?: boolean;
  numOfConnections?: number;
}

export interface DownloadMetadata {
  url: string;
  saveDirectory: string;
  filename: string;
  filesize: number;
  status: string;
  progress: number;
  speed: number;
  threads: number;
  complete: number;
  positions: number[];
  segmentsRange: PartialDownloadRange[];
  partFiles: string[];
}
