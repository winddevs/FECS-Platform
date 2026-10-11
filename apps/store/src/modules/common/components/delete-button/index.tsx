import { deleteLineItem } from "@lib/data/cart";
import { Spinner, Trash } from "@medusajs/icons";
import { clx } from "@medusajs/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

const DeleteButton = ({
  id,
  children,
  className,
  "data-testid": dataTestId,
}: {
  id: string;
  children?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) => {
  const t = useTranslations("cart.item");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    await deleteLineItem(id).catch(() => {
      setIsDeleting(false);
    });
  };

  return (
    <div
      className={clx(
        "flex items-center justify-between text-small-regular",
        className
      )}
    >
      <button
        type="button"
        data-testid={dataTestId}
        // Icon-only when there are no children, so it needs an accessible name.
        aria-label={children ? undefined : t("remove")}
        aria-busy={isDeleting}
        disabled={isDeleting}
        className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-x-1 rounded-rounded text-ui-fg-subtle hover:text-ui-fg-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive disabled:cursor-wait touch-manipulation"
        onClick={() => handleDelete(id)}
      >
        {isDeleting ? (
          <Spinner aria-hidden="true" className="animate-spin" />
        ) : (
          <Trash aria-hidden="true" />
        )}
        {children ? <span>{children}</span> : null}
      </button>
    </div>
  );
};

export default DeleteButton;
