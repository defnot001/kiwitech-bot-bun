import { Transform, TransformOptions } from 'stream';

export function createSplitter(): Transform {
  let buffer = Buffer.alloc(0);

  class SplitterTransform extends Transform {
    constructor(options?: TransformOptions) {
      super(options);
    }

    _transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void) {
      buffer = Buffer.concat([buffer, chunk]);

      let offset = 0;

      while (offset + 4 < buffer.length) {
        const length = buffer.readInt32LE(offset);
        if (offset + 4 + length > buffer.length) break;
        if (typeof offset === 'number' && typeof (offset + 4 + length) === 'number') {
          this.push(buffer.subarray(offset, offset + 4 + length));
        }
        offset += 4 + length;
      }

      if (typeof offset === 'number') {
        buffer = buffer.subarray(offset as number);
      }
      callback();
    }
  }

  return new SplitterTransform();
}
