import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * One admin user per fashion role, for the local docker stack and demos.
 *
 *   LOCAL_STACK=true npx medusa exec ./src/scripts/seed-demo-users.ts
 *
 * Every user gets the same well-known password, so this refuses to run unless
 * LOCAL_STACK=true. Real deployments invite users and use grant-fashion-role.
 */
const PASSWORD = "Passw0rd!local";
export const DEMO_USERS: Array<[string, string[]]> = [
  ["admin", ["ERP_ADMIN"]],
  ["procurement", ["PROCUREMENT"]],
  ["warehouse", ["WAREHOUSE_MANAGER"]],
  ["planner", ["PRODUCTION_PLANNER"]],
  ["cutter", ["CUTTING_OPERATOR"]],
  ["sewer", ["SEWING_OPERATOR"]],
  ["supervisor", ["SEWING_SUPERVISOR"]],
  ["qc", ["QC"]],
  ["packer", ["PACKING_OPERATOR"]],
  ["support", ["CUSTOMER_SUPPORT"]],
  ["finance", ["FINANCE"]],
  ["sre", ["SRE"]],
  ["norole", []],
];

export default async function seedDemoUsers({ container }: ExecArgs) {
  if (process.env.LOCAL_STACK !== "true") {
    throw new Error(
      "seed-demo-users creates accounts with a public password: set LOCAL_STACK=true to confirm this is not a real environment."
    );
  }
  const users = container.resolve(Modules.USER);
  const auth = container.resolve(Modules.AUTH);
  for (const [name, roles] of DEMO_USERS) {
    const email = `${name}@fashion.local`;
    let [user] = await users.listUsers({ email });
    if (!user) {
      user = await users.createUsers({ email, first_name: name });
      const { authIdentity } = await auth.register("emailpass", {
        body: { email, password: PASSWORD },
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
  console.log(`seeded ${DEMO_USERS.length} demo users (password ${PASSWORD})`);
}
