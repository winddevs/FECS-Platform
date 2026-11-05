import { Text, clx } from "@medusajs/ui";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import React from "react";

type AccordionItemProps = AccordionPrimitive.AccordionItemProps & {
  title: string;
  subtitle?: string;
  description?: string;
  required?: boolean;
  tooltip?: string;
  forceMountContent?: true;
  headingSize?: "small" | "medium" | "large";
  customTrigger?: React.ReactNode;
  complete?: boolean;
  active?: boolean;
  triggerable?: boolean;
  children: React.ReactNode;
};

type AccordionProps =
  | (AccordionPrimitive.AccordionSingleProps &
      React.RefAttributes<HTMLDivElement>)
  | (AccordionPrimitive.AccordionMultipleProps &
      React.RefAttributes<HTMLDivElement>);

const Accordion: React.FC<AccordionProps> & {
  Item: React.FC<AccordionItemProps>;
} = ({ children, ...props }) => {
  return (
    <AccordionPrimitive.Root {...props}>{children}</AccordionPrimitive.Root>
  );
};

const Item: React.FC<AccordionItemProps> = ({
  title,
  subtitle,
  description,
  children,
  className,
  headingSize: _headingSize = "large",
  customTrigger = undefined,
  forceMountContent = undefined,
  triggerable: _triggerable,
  ...props
}) => {
  return (
    <AccordionPrimitive.Item
      {...props}
      className={clx("sf-accordion-item group", className)}
    >
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="sf-accordion-head">
          <span>{title}</span>
          {customTrigger || <ChevronDown aria-hidden="true" />}
        </AccordionPrimitive.Trigger>
        {subtitle && (
          <Text as="span" size="small" className="mt-1">
            {subtitle}
          </Text>
        )}
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content
        forceMount={forceMountContent}
        className="radix-state-closed:animate-accordion-close radix-state-open:animate-accordion-open radix-state-closed:pointer-events-none overflow-hidden"
      >
        <div className="group-radix-state-closed:animate-accordion-close">
          {description && <Text>{description}</Text>}
          <div className="w-full">{children}</div>
        </div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
};

Accordion.Item = Item;

export default Accordion;
