import { useState } from "react";

import {
  DetailSection,
  KeyValueGrid,
  MiniTable,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import { LabelButton } from "../../lib/erp/label-dialog";
import { LookupBox } from "../../lib/erp/lookup-box";
import type { Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";
import {
  balanceColumns,
  locationColumns,
  rollColumns,
} from "./materials-lists";

type ScanResponse =
  | { type: "ROLL"; roll: Row; balances: Row[] }
  | { type: "LOCATION"; location: Row; balances: Row[] };

const BASE = "/admin/material-inventory";

const ScanResult = ({ scan }: { scan: ScanResponse }) => {
  if (scan.type === "ROLL") {
    return (
      <>
        <DetailSection
          actions={
            <LabelButton
              label={tr("Print label")}
              path={`${BASE}/labels/roll/${encodeURIComponent(String(scan.roll.roll_code))}`}
              title={tr("Roll label {code}", {
                code: String(scan.roll.roll_code),
              })}
            />
          }
          title={tr("Roll {code}", { code: String(scan.roll.roll_code) })}
        >
          <KeyValueGrid columns={rollColumns} row={scan.roll} />
        </DetailSection>
        <DetailSection title="Stock of this roll">
          <MiniTable
            columns={balanceColumns}
            label={tr("Roll balances")}
            rows={scan.balances}
          />
        </DetailSection>
      </>
    );
  }
  return (
    <>
      <DetailSection
        actions={
          <LabelButton
            label={tr("Print label")}
            path={`${BASE}/labels/location/${encodeURIComponent(String(scan.location.code))}`}
            title={tr("Location label {code}", {
              code: String(scan.location.code),
            })}
          />
        }
        title={tr("Location {code}", { code: String(scan.location.code) })}
      >
        <KeyValueGrid columns={locationColumns} row={scan.location} />
      </DetailSection>
      <DetailSection title="Stock at this location">
        <MiniTable
          columns={balanceColumns}
          label={tr("Location balances")}
          rows={scan.balances}
        />
      </DetailSection>
    </>
  );
};

const ScanLookup = ({ code }: { code: string }) => {
  const query = useErpQuery<ScanResponse>(
    `${BASE}/scan/${encodeURIComponent(code)}`
  );
  return (
    <QueryBoundary query={query}>
      {(scan) => <ScanResult scan={scan} />}
    </QueryBoundary>
  );
};

/** Scanner box: a roll code or a location code returns what it is + stock. */
export const ScanTab = () => {
  const [code, setCode] = useState<string | null>(null);
  return (
    <div className="flex flex-col divide-y">
      <div className="px-6 py-4">
        <LookupBox
          label={tr("Scan or type a roll / location code")}
          onLookup={setCode}
          placeholder={tr("e.g. ROLL-0001")}
        />
      </div>
      {code ? <ScanLookup code={code} key={code} /> : null}
    </div>
  );
};
