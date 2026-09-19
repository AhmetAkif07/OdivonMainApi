import { parsePrivateKey } from './env.schema';

describe('parsePrivateKey', () => {
  it('unescapes newline sequences', () => {
    expect(parsePrivateKey('-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n')).toBe(
      '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    );
  });
});
