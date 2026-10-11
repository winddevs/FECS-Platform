import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import {
  BackBar,
  DetailSection,
  KeyValueGrid,
  MiniTable,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import type { Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";
import {
  authorizeFields,
  inspectFields,
  refundFields,
  rejectFields,
  returnHeaderColumns,
  returnItemColumns,
} from "./returns-config";

const BASE = "/admin/returns";

type ReturnResponse = { return: Row; items: Row[] };

const ReturnActions = ({ rma }: { rma: Row }) => {
  const url = `${BASE}/${String(rma.id)}`;
  const status = String(rma.status);
  const canRefund = status === "INSPECTED" || status === "CLOSED";
  const isExchange = rma.type === "EXCHANGE";
  return (
    <>
      {status === "REQUESTED" ? (
        <>
          <ActionDrawer
            endpoint={`${url}/authorize`}
            fields={authorizeFields}
            label="Authorize"
            submitLabel="Authorize return"
            variant="primary"
          />
          <ActionDrawer
            endpoint={`${url}/reject`}
            fields={rejectFields}
            label="Reject"
            submitLabel="Reject return"
            variant="danger"
          />
        </>
      ) : null}
      {status === "AUTHORIZED" || status === "IN_TRANSIT" ? (
        <ConfirmActionButton
          endpoint={`${url}/receive`}
          label="Mark received"
          prompt="Confirm the returned goods arrived at the warehouse?"
          variant="primary"
        />
      ) : null}
      {canRefund ? (
        <ActionDrawer
          endpoint={`${url}/refund`}
          fields={refundFields}
          label="Refund"
          submitLabel="Issue refund"
        />
      ) : null}
      {status === "INSPECTED" ? (
        <ConfirmActionButton
          endpoint={`${url}/close`}
          label="Close return"
          prompt="Close this return? All returned stock must already be posted."
        />
      ) : null}
      {isExchange && !rma.replacement_shipped_at ? (
        <ConfirmActionButton
          endpoint={`${url}/ship-replacement`}
          label="Ship replacement"
          prompt="Ship the replacement item for this exchange?"
        />
      ) : null}
    </>
  );
};

export const ReturnDetail = ({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) => {
  const query = useErpQuery<ReturnResponse>(`${BASE}/${id}`);
  return (
    <div className="flex flex-col divide-y">
      <BackBar label="returns" onBack={onBack} />
      <QueryBoundary query={query}>
        {({ return: rma, items }) => (
          <>
            <DetailSection
              actions={<ReturnActions rma={rma} />}
              title={tr("Return {rma_no}", { rma_no: String(rma.rma_no) })}
            >
              <KeyValueGrid columns={returnHeaderColumns} row={rma} />
            </DetailSection>
            <DetailSection title="Items">
              <MiniTable
                columns={returnItemColumns}
                label={tr("Return items")}
                renderRowActions={(item) =>
                  item.disposition === "PENDING" &&
                  rma.status === "RECEIVED" ? (
                    <ActionDrawer
                      endpoint={`${BASE}/${id}/items/${String(item.id)}/inspect`}
                      fields={inspectFields}
                      label="Inspect"
                      submitLabel="Save inspection"
                      variant="primary"
                    />
                  ) : null
                }
                rows={items}
              />
            </DetailSection>
          </>
        )}
      </QueryBoundary>
    </div>
  );
};
