import type { CollectionConfig } from "payload";

import { isAdmin, isAdminFieldLevel } from "@/access/isAdmin";
import { isAdminOrSelf, isAdminOrSelfFieldLevel } from "@/access/isAdminOrSelf";

export const Users: CollectionConfig = {
  slug: "users",
  access: {
    // Only admins may open the Payload panel. `authenticated` let any logged-in
    // user in, including role `public`.
    admin: ({ req: { user } }) => Boolean(user?.roles?.includes("admin")),
    create: isAdmin,
    delete: isAdminOrSelf,
    // Admins read everyone; any other user reads only themselves.
    read: isAdminOrSelf,
    update: isAdminOrSelf,
  },
  admin: {
    defaultColumns: ["name", "email"],
    useAsTitle: "name",
  },
  auth: {
    useAPIKey: true,
  },
  fields: [
    {
      name: "name",
      type: "text",
    },
    {
      name: "roles",
      type: "select",
      access: {
        create: isAdminFieldLevel,
        read: isAdminOrSelfFieldLevel,
        update: isAdminFieldLevel,
      },
      defaultValue: ["public"],
      hasMany: true,
      options: ["admin", "public"],
      required: true,
    },
  ],
  timestamps: true,
};
