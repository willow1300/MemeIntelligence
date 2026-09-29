// Minimal base58 encoder (Bitcoin alphabet — same as Solana).
// Used by the Solana provider to turn 32-byte on-chain authorities into
// wallet addresses. Dependency-free and pure for testing.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Encode bytes to a base58 string (standard big-integer algorithm). */
export function base58Encode(input: Uint8Array | number[]): string {
  const data = Array.from(input);
  let zeroCount = 0;
  while (zeroCount < data.length && data[zeroCount] === 0) zeroCount += 1;

  const size = Math.max(1, Math.ceil((data.length - zeroCount) * 138 / 100 + 1));
  const b58 = new Array<number>(size).fill(0);
  let length = 0;

  for (let i = zeroCount; i < data.length; i++) {
    let carry = data[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * (b58[k] || 0);
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }

  let result = '';
  for (let i = 0; i < zeroCount; i++) result += ALPHABET[0]; // '1'
  for (let k = size - length; k < size; k++) result += ALPHABET[b58[k]];
  return result;
}

/**
 * Decode base64 (standard or url-safe, with padding) to bytes.
 * Accepts the "base64"/"base64+" Solana RPC encodings.
 */
export function base64ToBytes(value: string): Uint8Array {
  const base64 = value.includes('-') || value.includes('_') ? value.replace(/-/g, '+').replace(/_/g, '/') : value;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}