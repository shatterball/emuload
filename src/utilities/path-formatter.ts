import { join } from 'path';

export class PathFormatter {
  public static format(directory: string, filename: string): string {
    const fullPath: string = join(directory, filename);

    return fullPath;
  }
}
