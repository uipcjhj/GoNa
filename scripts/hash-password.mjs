// Usage: npm run hash-password
// Prints a PBKDF2 hash for APP_PASSWORD_HASH / VIEWER_PASSWORD_HASH so the plain password never has to be stored anywhere.
// The password is read from stdin (input is not echoed when run in a terminal).
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const prompt = "해시할 비밀번호: ";
if (process.stdin.isTTY) rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(s); };
rl.question(prompt, async (pw) => {
  rl.close();
  process.stdout.write("\n");
  if (!pw || pw.length < 8) {
    console.error("8자 이상 입력하세요.");
    process.exit(1);
  }
  const it = 210000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: it }, key, 256));
  const b64 = (u) => Buffer.from(u).toString("base64");
  console.log(`pbkdf2$${it}$${b64(salt)}$${b64(bits)}`);
});
