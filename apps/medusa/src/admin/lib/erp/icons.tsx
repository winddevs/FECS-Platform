import type { ComponentType, SVGProps } from "react";

/**
 * Sidebar icons. @medusajs/icons is not a direct dependency of this app (and
 * the admin bundler cannot resolve it from here), so the few glyphs we need
 * are drawn inline in the same 15x15 outline style.
 */
type IconProps = SVGProps<SVGSVGElement>;

const ICON_SIZE = 15;
const STROKE_WIDTH = 1.25;

const makeIcon = (label: string, paths: readonly string[]): ComponentType => {
  const Icon = (props: IconProps) => (
    <svg
      aria-hidden="true"
      fill="none"
      height={ICON_SIZE}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={STROKE_WIDTH}
      viewBox="0 0 15 15"
      width={ICON_SIZE}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {paths.map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
  Icon.displayName = label;
  return Icon;
};

export const ProcurementIcon = makeIcon("ProcurementIcon", [
  "M3 4.5h9l-.8 7.5H3.8L3 4.5Z",
  "M5.5 4.5V4a2 2 0 0 1 4 0v.5",
]);

export const MaterialsIcon = makeIcon("MaterialsIcon", [
  "M7.5 2 2 4.75l5.5 2.75L13 4.75 7.5 2Z",
  "M2 7.75l5.5 2.75L13 7.75",
  "M2 10.5l5.5 2.5 5.5-2.5",
]);

export const PlanningIcon = makeIcon("PlanningIcon", [
  "M2.5 3.5h10v9h-10v-9Z",
  "M2.5 6.5h10",
  "M5 2v3",
  "M10 2v3",
]);

export const ProductionIcon = makeIcon("ProductionIcon", [
  "M2 12.5V7l3.5 2V7L9 9V4.5h2.5v8H2Z",
]);

export const ShopFloorIcon = makeIcon("ShopFloorIcon", [
  "M2 4v7",
  "M4.5 4v7",
  "M7 4v7",
  "M9 4v7",
  "M11.5 4v7",
  "M13 4v7",
]);

export const QualityIcon = makeIcon("QualityIcon", [
  "M7.5 1.5l5 2v4c0 3-2 4.5-5 6-3-1.5-5-3-5-6v-4l5-2Z",
  "M5.2 7.5l1.6 1.6 3-3.2",
]);

export const FinishedGoodsIcon = makeIcon("FinishedGoodsIcon", [
  "M7.5 1.8l5.3 2.7v6l-5.3 2.7-5.3-2.7v-6l5.3-2.7Z",
  "M2.2 4.5l5.3 2.7 5.3-2.7",
  "M7.5 7.2v6",
]);

export const FulfillmentIcon = makeIcon("FulfillmentIcon", [
  "M1.5 4h7v6h-7V4Z",
  "M8.5 6h2.7l1.8 2v2H8.5V6Z",
  "M3 11.5a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0Z",
  "M9.6 11.5a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0Z",
]);

export const ReturnsIcon = makeIcon("ReturnsIcon", [
  "M5.5 3.5l-3 3 3 3",
  "M2.5 6.5H9a3.5 3.5 0 0 1 0 7H6",
]);

export const SocialIcon = makeIcon("SocialIcon", [
  "M2.5 3h10v7h-5l-3 2.5V10h-2V3Z",
]);

export const OperationsIcon = makeIcon("OperationsIcon", [
  "M2 11a5.5 5.5 0 1 1 11 0",
  "M7.5 11l2.5-3.5",
  "M2 11h11",
]);
