import request = require('request');
import { AcceptRanges } from './accept-ranges';

export interface RequestMetadata {
  readonly acceptRanges: string;
  readonly contentLength: number;
}
export class RequestQuery {
  public static getMetadata(url: string, headers?: request.Headers): Promise<RequestMetadata> {
    return new Promise<RequestMetadata>((resolve, reject) => {
      const options: request.CoreOptions = {};
      options.headers = headers || {};

      request.head(url, options, (err, res, body) => {
        if (err) {
          let size = 0;
          const range = 'bytes=0-500';
          options.headers.Range = range;
          const req = request
            .get(url, options, (err, resp, body) => {
              if (err) {
                return reject(err);
              }
              if (body.length === 501) {
                const metadata = {
                  acceptRanges: AcceptRanges.Bytes,
                  contentLength: parseInt(
                    resp.headers['content-range'].replace(range.replace('=', ' ') + '/', ''),
                    10
                  ),
                };
                return resolve(metadata);
              }
            })
            .on('data', (data) => {
              size += data.length;
              if (size > 501) {
                req.abort();
              }
            });
        } else {
          const metadata = {
            acceptRanges: res.headers['accept-ranges'],
            contentLength: parseInt(res.headers['content-length'], 10),
          };
          return resolve(metadata);
        }
      });
    });
  }
}
