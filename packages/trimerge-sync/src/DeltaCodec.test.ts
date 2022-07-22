import { JSON_DELTA_CODEC } from './DeltaCodec';

describe('JSON_DELTA_CODEC', () => {
  it('should roundtrip json objects', () => {
    const obj = { a: 1, b: 2 };
    const encoded = JSON_DELTA_CODEC.encode(obj);
    const decoded = JSON_DELTA_CODEC.decode(encoded);
    expect(decoded).toEqual(obj);
  });
});
