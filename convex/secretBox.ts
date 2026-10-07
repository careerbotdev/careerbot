// Encrypts workspace secrets (like a bring-your-own API key) at rest.
// MASTER_KEY_V1 is 32 random bytes, hex encoded, kept in Infisical and copied to Convex.
const VERSION = "v1";

async function masterKey() {
  const hex = process.env.MASTER_KEY_V1;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error("MASTER_KEY_V1 is missing or malformed.");
  const bytes = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await masterKey(), new TextEncoder().encode(plain));
  return `${VERSION}.${toB64(iv)}.${toB64(new Uint8Array(data))}`;
}

export async function open(sealed: string): Promise<string> {
  const [version, iv, data] = sealed.split(".");
  if (version !== VERSION || !iv || !data) throw new Error("Unreadable secret.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await masterKey(), fromB64(data));
  return new TextDecoder().decode(plain);
}
