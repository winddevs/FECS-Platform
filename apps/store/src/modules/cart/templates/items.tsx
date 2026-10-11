import repeat from "@lib/util/repeat";
import { HttpTypes } from "@medusajs/types";
import { Heading, Table } from "@medusajs/ui";
import Item from "@modules/cart/components/item";
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item";
import { useTranslations } from "next-intl";

type ItemsTemplateProps = {
  cart?: HttpTypes.StoreCart;
};

const ItemsTemplate = ({ cart }: ItemsTemplateProps) => {
  const t = useTranslations("cart");
  const items = cart?.items;
  return (
    <div>
      <div className="pb-3 flex items-center">
        <Heading className="text-[2rem] leading-[2.75rem]">
          {t("title")}
        </Heading>
      </div>
      <Table>
        <Table.Header className="border-t-0">
          <Table.Row className="text-ui-fg-subtle txt-medium-plus">
            <Table.HeaderCell className="!pl-0">
              {t("table.item")}
            </Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
            <Table.HeaderCell>{t("table.quantity")}</Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell">
              {t("table.price")}
            </Table.HeaderCell>
            <Table.HeaderCell className="!pr-0 text-right">
              {t("table.total")}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items
            ? items
                .sort((a, b) => {
                  return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1;
                })
                .map((item) => {
                  return (
                    <Item
                      key={item.id}
                      item={item}
                      currencyCode={cart?.currency_code}
                    />
                  );
                })
            : repeat(5).map((i) => {
                return <SkeletonLineItem key={i} />;
              })}
        </Table.Body>
      </Table>
    </div>
  );
};

export default ItemsTemplate;
