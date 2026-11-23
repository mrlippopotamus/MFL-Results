import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

try {
  const password = randomBytes(24).toString("base64url");
  await writeFile(".dev.vars", "MFL_ADMIN_PASSWORD=" + password + "\n", {
    flag: "wx", mode: 0o600,
  });
  console.log("Local sign-in created. Use admin and the password in .dev.vars.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
