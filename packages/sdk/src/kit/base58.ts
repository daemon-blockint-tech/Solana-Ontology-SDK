/**
 * Minimal base58 (Bitcoin alphabet) decoder — enough to turn base58 addresses
 * into raw bytes without pulling in an external dependency.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_MAP = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function decodeBase58(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);

  const bytes: number[] = [];
  for (const char of input) {
    const value = ALPHABET_MAP.get(char);
    if (value === undefined) {
      throw new Error(`Invalid base58 character "${char}"`);
    }
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Preserve leading zeros (encoded as "1")
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}
