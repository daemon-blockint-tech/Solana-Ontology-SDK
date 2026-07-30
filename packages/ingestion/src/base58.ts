/**
 * Minimal base58 (Bitcoin alphabet) encoder for pubkey/signature bytes from
 * the Yellowstone wire format. Dependency-free.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let prefix = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    prefix += "1";
  }
  return (
    prefix +
    digits
      .reverse()
      .map((d) => ALPHABET[d])
      .join("")
  );
}
