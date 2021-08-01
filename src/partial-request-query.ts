import request from 'request';
import got, { Response, CancelableRequest } from 'got';
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
      got
        .head(url, {
          headers,
          retry: 0,
        })
        .then((res) => {
          const metadata = {
            acceptRanges: res.headers['accept-ranges'],
            contentLength: parseInt(res.headers['content-length'], 10),
          };
          return resolve(metadata);
        })
        .catch(() => {
          let size = 0;
          const range = 'bytes=0-500';
          options.headers.Range = range;
          const req: CancelableRequest<Response> = got.get(url, {
            headers: { ...headers, Range: 'bytes=0-500' },
            retry: 0,
          });
          req
            .then((res) => {
              const metadata = {
                acceptRanges: AcceptRanges.Bytes,
                contentLength: parseInt(
                  res.headers['content-range'].replace(range.replace('=', ' ') + '/', ''),
                  10
                ),
              };
              return resolve(metadata);
            })
            .catch((err) => {
              if (err.name === 'CancelError') {
                const metadata = {
                  acceptRanges: AcceptRanges.None,
                  contentLength: size,
                };
                return resolve(metadata);
              } else {
                reject();
              }
            });
          req.on('downloadProgress', ({ transferred, total }) => {
            if (transferred > 501) {
              size = total;
              req.cancel();
            }
          });
        });
    });
  }
}
