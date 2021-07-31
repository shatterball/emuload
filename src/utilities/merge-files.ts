import fs from 'fs';
import multistream from 'multistream';

export class MergeFiles {
  public static merge(partFiles, filepath): Promise<void> {
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
        resolve();
      });
      multiStream.on('error', () => {
        output.close();
        reject();
      });
    });
  }
}
