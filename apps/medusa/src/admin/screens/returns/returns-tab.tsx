import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ResourceTable } from "../../lib/erp/resource-table";
import { ReturnDetail } from "./return-detail";
import { requestReturnFields, returnsList } from "./returns-config";

export const ReturnsTab = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) {
    return <ReturnDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }
  return (
    <ResourceTable
      config={returnsList}
      onRowClick={(row) => setSelectedId(String(row.id))}
      toolbar={
        <ActionDrawer
          description="Open a return on behalf of a customer."
          endpoint="/admin/returns"
          fields={requestReturnFields}
          label="New return"
          submitLabel="Create return"
        />
      }
    />
  );
};
