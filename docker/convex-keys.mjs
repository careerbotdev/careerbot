// Makes the keys a new CareerBot deployment needs, printed as shell assignments for docker/convex-setup.sh:
//   node docker/convex-keys.mjs jwt      JWT_PRIVATE_KEY and JWKS, Convex Auth's signing key and its public half
//                                       (the format of Convex Auth's own setup: the PEM on one line, newlines as spaces)
//   node docker/convex-keys.mjs master   MASTER_KEY_V1, 32 random bytes as hex (convex/secretBox.ts)
import { generateKeyPairSync, randomBytes } from "node:crypto";

const kind = process.argv[2];
if (kind === "jwt") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trimEnd().replace(/\n/g, " ");
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey.export({ format: "jwk" }) }] });
  console.log(`JWT_PRIVATE_KEY='${pem}'\nJWKS='${jwks}'`);
} else if (kind === "master") {
  console.log(`MASTER_KEY_V1='${randomBytes(32).toString("hex")}'`);
} else {
  console.error("usage: node docker/convex-keys.mjs jwt|master");
  process.exit(1);
}
