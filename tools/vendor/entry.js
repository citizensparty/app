// Everything the app needs from Nostr: keys, event signing/verification, NIP-06 recovery phrases, NIP-19 encodings, QR codes.
export { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, getEventHash } from "nostr-tools/pure";
export * as nip19 from "nostr-tools/nip19";
export { generateSeedWords, validateWords, privateKeyFromSeedWords } from "nostr-tools/nip06";
export { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
export { sha256 } from "@noble/hashes/sha2.js";
import qrcode from "qrcode-generator";
export function qrSvg(text) { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
export { wordlist } from "@scure/bip39/wordlists/english.js"; // the 2,048 words, for autocomplete when restoring a key
