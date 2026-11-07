import { Button, Checkbox, Label, Text } from "@medusajs/ui";
import { useId, useState } from "react";

import {
  DetailSection,
  MiniTable,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import { FormDrawer } from "../../lib/erp/form-drawer";
import type { ColumnConfig } from "../../lib/erp/resource-types";
import { useErpCommand, useErpQuery } from "../../lib/erp/use-erp";
import { tr, trStatus } from "../../lib/i18n";

const ENDPOINT = "/admin/access";
const ALL_PERMISSIONS_ROLE = "ERP_ADMIN";

type RoleInfo = { role: string; permissions: string[] };
type StaffMember = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  roles: string[];
};
type AccessResponse = { roles: RoleInfo[]; users: StaffMember[] };

const fullName = (user: StaffMember): string =>
  [user.first_name, user.last_name].filter(Boolean).join(" ");

const staffColumns: readonly ColumnConfig[] = [
  { key: "email", label: "Email" },
  { key: "name", label: "Name", value: (row) => fullName(row as StaffMember) },
  {
    key: "roles",
    label: "Roles",
    value: (row) => {
      const { roles } = row as StaffMember;
      return roles.length === 0
        ? tr("No role")
        : roles.map((role) => trStatus(role)).join(", ");
    },
  },
];

const roleColumns: readonly ColumnConfig[] = [
  { key: "role", label: "Role", kind: "status" },
  {
    key: "count",
    label: "Permissions",
    kind: "number",
    value: (row) => (row as RoleInfo).permissions.length,
  },
  {
    key: "permissions",
    label: "Can do",
    value: (row) => {
      const { role, permissions } = row as RoleInfo;
      return role === ALL_PERMISSIONS_ROLE
        ? tr("Everything")
        : permissions.join(", ");
    },
  },
];

const RolesDrawer = ({
  user,
  roles,
}: {
  user: StaffMember;
  roles: readonly RoleInfo[];
}) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const idPrefix = useId();
  const command = useErpCommand({
    endpoint: `${ENDPOINT}/users/${user.id}`,
    method: "PUT",
    successMessage: "Roles saved",
    onSuccess: () => setOpen(false),
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelected(new Set(user.roles));
    }
    setOpen(next);
  };

  const toggle = (role: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(role);
      } else {
        next.delete(role);
      }
      return next;
    });
  };

  return (
    <>
      <Button
        onClick={() => handleOpenChange(true)}
        size="small"
        variant="secondary"
      >
        {tr("Edit roles")}
      </Button>
      <FormDrawer
        description="Changes apply from the user's next request. A user with no role cannot open any ERP or commerce screen."
        isPending={command.isPending}
        onOpenChange={handleOpenChange}
        onSubmit={() =>
          command.mutate({
            roles: roles
              .map((info) => info.role)
              .filter((role) => selected.has(role)),
          })
        }
        open={open}
        submitLabel="Save roles"
        title="Edit roles"
      >
        <div className="flex flex-col gap-y-3">
          <Text leading="compact" size="small" weight="plus">
            {user.email}
          </Text>
          {roles.map((info) => {
            const id = `${idPrefix}-${info.role}`;
            return (
              <div className="flex items-start gap-x-2" key={info.role}>
                <Checkbox
                  checked={selected.has(info.role)}
                  id={id}
                  onCheckedChange={(checked) =>
                    toggle(info.role, checked === true)
                  }
                />
                <div className="flex flex-col">
                  <Label htmlFor={id} size="small" weight="plus">
                    {trStatus(info.role)}
                  </Label>
                  <Text
                    className="text-ui-fg-subtle"
                    leading="compact"
                    size="small"
                  >
                    {`${info.role} · ${tr("{count} permissions", { count: info.permissions.length })}`}
                  </Text>
                </div>
              </div>
            );
          })}
        </div>
      </FormDrawer>
    </>
  );
};

/** Who can do what: assign roles to admin users, and see what each role allows. */
export const AccessTab = () => {
  const query = useErpQuery<AccessResponse>(ENDPOINT);
  return (
    <div className="flex flex-col divide-y">
      <QueryBoundary query={query}>
        {({ users, roles }) => (
          <>
            <DetailSection title="Staff">
              <MiniTable
                columns={staffColumns}
                empty="No admin users yet."
                label="Staff"
                renderRowActions={(row) => (
                  <RolesDrawer roles={roles} user={row as StaffMember} />
                )}
                rows={users}
              />
            </DetailSection>
            <DetailSection title="Roles">
              <MiniTable
                columns={roleColumns}
                label="Roles"
                rows={roles.map((info) => ({ ...info, id: info.role }))}
              />
            </DetailSection>
          </>
        )}
      </QueryBoundary>
    </div>
  );
};
