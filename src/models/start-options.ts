import { Headers } from 'request';

export interface StartOptions {
  numOfConnections?: number;
  saveDirectory?: string;
  fileName?: string;
  headers?: Headers;
  throttle?: number;
}
