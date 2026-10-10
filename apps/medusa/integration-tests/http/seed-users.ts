import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Creates the admin users used by the HTTP test, each with one fashion role.
 * Idempotent: existing users are left alone and only (re)granted their role.
 */
const USERS: Array<[string, string[]]> = [
  ["admin@fashion.test", ["ERP_ADMIN"]],
  ["norole@fashion.test", []],
  ["planner@fashion.test", ["PRODUCTION_PLANNER"]],
  ["cutter@fashion.test", ["CUTTING_OPERATOR"]],
  ["sewer@fashion.test", ["SEWING_OPERATOR"]],
  ["qc@fashion.test", ["QC"]],
  ["packer@fashion.test", ["PACKING_OPERATOR"]],
  ["sre@fashion.test", ["SRE"]],
];

export default async function seedUsers({ container }: ExecArgs) {
  const users = container.resolve(Modules.USER);
  const auth = container.resolve(Modules.AUTH);
  for (const [email, roles] of USERS) {
    let [user] = await users.listUsers({ email });
    if (!user) {
      user = await users.createUsers({
        email,
        first_name: email.split("@")[0],
      });
      const { authIdentity } = await auth.register("emailpass", {
        body: { email, password: "Passw0rd!test" },
      } as never);
      await auth.updateAuthIdentities({
        id: (authIdentity as { id: string }).id,
        app_metadata: { user_id: user.id },
      });
    }
    await users.updateUsers({
      id: user.id,
      metadata: { ...user.metadata, fashion_roles: roles },
    });
  }
  console.log("seeded", USERS.length, "users");
}
