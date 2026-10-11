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
import {
  goodsReceiptFields,
  poHeaderColumns,
  poLineColumns,
  receiptColumns,
} from "./procurement-config";

type PurchaseOrderResponse = { purchase_order: Row; lines: Row[] };
type ReceiptsResponse = { goods_receipts: Row[] };

const PO_BASE = "/admin/procurement/purchase-orders";

/** Transitions the API allows (module state machine); others are hidden. */
const canApprove = (status: string) => status === "DRAFT";
const canSend = (status: string) => status === "APPROVED";
const canReceive = (status: string) =>
  status === "SENT" || status === "PARTIALLY_RECEIVED";
const canClose = (status: string) =>
  status === "RECEIVED" || status === "PARTIALLY_RECEIVED";
const canCancel = (status: string) =>
  status === "DRAFT" || status === "APPROVED" || status === "SENT";

const PurchaseOrderActions = ({
  id,
  status,
  lines,
}: {
  id: string;
  status: string;
  lines: Row[];
}) => {
  const url = `${PO_BASE}/${id}`;
  return (
    <>
      {canApprove(status) ? (
        <ConfirmActionButton
          endpoint={`${url}/approve`}
          label="Approve"
          prompt="Approve this purchase order? It can then be sent to the supplier."
          reason={{ label: "Note (optional)" }}
          variant="primary"
        />
      ) : null}
      {canSend(status) ? (
        <ConfirmActionButton
          endpoint={`${url}/send`}
          label="Send to supplier"
          prompt="Mark this purchase order as sent to the supplier?"
          reason={{ label: "Note (optional)" }}
          variant="primary"
        />
      ) : null}
      {canReceive(status) ? (
        <ActionDrawer
          description="Record the goods that arrived. Use the QC_HOLD bucket for goods that must be inspected before use."
          endpoint={`${url}/receipts`}
          fields={goodsReceiptFields(lines)}
          label="Record goods receipt"
          submitLabel="Post receipt"
          title="Record goods receipt"
          variant="primary"
        />
      ) : null}
      {canClose(status) ? (
        <ConfirmActionButton
          endpoint={`${url}/close`}
          label="Close"
          prompt="Close this purchase order? No further goods can be received."
          reason={{ label: "Reason (optional)" }}
        />
      ) : null}
      {canCancel(status) ? (
        <ConfirmActionButton
          danger
          endpoint={`${url}/cancel`}
          label="Cancel order"
          prompt="Cancel this purchase order?"
          reason={{ label: "Reason", required: true }}
        />
      ) : null}
    </>
  );
};

export const PurchaseOrderDetail = ({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) => {
  const order = useErpQuery<PurchaseOrderResponse>(`${PO_BASE}/${id}`);
  const receipts = useErpQuery<ReceiptsResponse>(`${PO_BASE}/${id}/receipts`);

  return (
    <div className="flex flex-col divide-y">
      <BackBar label="purchase orders" onBack={onBack} />
      <QueryBoundary query={order}>
        {({ purchase_order, lines }) => (
          <>
            <DetailSection
              actions={
                <PurchaseOrderActions
                  id={id}
                  lines={lines}
                  status={String(purchase_order.status)}
                />
              }
              title={`Purchase order ${String(purchase_order.po_number)}`}
            >
              <KeyValueGrid columns={poHeaderColumns} row={purchase_order} />
            </DetailSection>
            <DetailSection title="Lines">
              <MiniTable columns={poLineColumns} label="Lines" rows={lines} />
            </DetailSection>
          </>
        )}
      </QueryBoundary>
      <DetailSection title="Goods receipts">
        <QueryBoundary query={receipts}>
          {({ goods_receipts }) => (
            <MiniTable
              columns={receiptColumns}
              empty="No goods received yet."
              label="Goods receipts"
              rows={goods_receipts}
            />
          )}
        </QueryBoundary>
      </DetailSection>
    </div>
  );
};
