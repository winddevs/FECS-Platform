import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { useTranslations } from "next-intl";

type Crumb = { label: string; href: string };

type PageHeroProps = {
  title: string;
  description?: string | null;
  /** Ancestors between "Home" and the current page. */
  trail?: Crumb[];
  "data-testid"?: string;
};

/** Title band that opens store, collection and category pages. */
export default function PageHero({
  title,
  description,
  trail = [],
  "data-testid": dataTestId,
}: PageHeroProps) {
  const t = useTranslations("layout.sideMenu");
  const tHeader = useTranslations("layout.header");

  return (
    <div className="sf-page-hero">
      <nav className="sf-breadcrumb" aria-label={tHeader("breadcrumb")}>
        <LocalizedClientLink href="/">{t("home")}</LocalizedClientLink>
        {trail.map((crumb) => (
          <span key={crumb.href} className="contents">
            <span aria-hidden="true">/</span>
            <LocalizedClientLink href={crumb.href}>
              {crumb.label}
            </LocalizedClientLink>
          </span>
        ))}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <h1 data-testid={dataTestId}>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
