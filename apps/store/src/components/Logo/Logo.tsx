import clsx from "clsx";
import { useTranslations } from "next-intl";

interface Props {
  className?: string;
  loading?: "lazy" | "eager";
  priority?: "auto" | "high" | "low";
  url?: string;
}

export default function Logo(props: Props) {
  const {
    loading: loadingFromProps,
    priority: priorityFromProps,
    url: urlFromProps,
    className,
  } = props;

  const t = useTranslations("components.logo");
  const loading = loadingFromProps || "lazy";
  const priority = priorityFromProps || "low";

  return (
    <img
      alt={t("alt")}
      width={142}
      height={42}
      loading={loading}
      fetchPriority={priority}
      decoding="async"
      className={clsx("h-[28px] w-full max-w-[13rem]", className)}
      src={urlFromProps ?? "/logo.png"}
    />
  );
}
