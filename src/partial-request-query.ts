import got, { Response, CancelableRequest } from 'got';
import { AcceptRanges } from './accept-ranges';

export interface RequestMetadata {
  readonly acceptRanges: string;
  readonly contentLength: number;
}
export class RequestQuery {
  public static getMetadata(url: string, headers?: Object): Promise<RequestMetadata> {
    return new Promise<RequestMetadata>((resolve, reject) => {
      const options = {
        retry: 0,
        headers: headers || {},
      };

      function hackyHead(): void {
        let size = 0;
        const req: CancelableRequest<Response> = got.get(url, new Object(options));
        options.headers['Range'] = `${AcceptRanges.Bytes}=0-500`;

        function success(res): void {
          const metadata = {
            acceptRanges: AcceptRanges.Bytes,
            contentLength: parseInt(
              res.headers['content-range'].replace(
                options.headers['Range'].replace('=', ' ') + '/',
                ''
              ),
              10
            ),
          };
          return resolve(metadata);
        }

        function error(err): void {
          if (err === got.CancelError) {
            const metadata = {
              acceptRanges: AcceptRanges.None,
              contentLength: size,
            };
            return resolve(metadata);
          } else {
            reject();
          }
        }

        req.then(success).catch(error);
        req.on('downloadProgress', ({ transferred, total }) => {
          if (transferred > 501) {
            size = total;
            req.cancel();
          }
        });
      }

      got
        .head(url, new Object(options))
        .then((res) => {
          const metadata = {
            acceptRanges: res.headers['accept-ranges'],
            contentLength: parseInt(res.headers['content-length'], 10),
          };
          return resolve(metadata);
        })
        .catch(hackyHead);
    });
  }
}
