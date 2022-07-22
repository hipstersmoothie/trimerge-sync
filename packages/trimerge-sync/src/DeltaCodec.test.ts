import { JSON_DELTA_CODEC } from './DeltaCodec';

describe('JSON_DELTA_CODEC', () => {
  it('should roundtrip json objects', () => {
    const obj = { a: 1, b: 2 };
    const encoded = JSON_DELTA_CODEC.encode(obj);
    const decoded = JSON_DELTA_CODEC.decode(encoded);
    expect(decoded).toEqual(obj);
  });
  it('should roundtrip undefined', () => {
    const obj = undefined;
    const encoded = JSON_DELTA_CODEC.encode(obj);
    const decoded = JSON_DELTA_CODEC.decode(encoded);
    expect(decoded).toBeUndefined();
  });
  it('should not decode undefined deltas', () => {
    expect(() => JSON_DELTA_CODEC.decode(undefined)).toThrow();
  });
});
