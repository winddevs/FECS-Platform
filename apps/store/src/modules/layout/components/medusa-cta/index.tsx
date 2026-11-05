import { useTranslations } from "next-intl";

import Medusa from "@/modules/common/icons/medusa";
import NextJs from "@/modules/common/icons/nextjs";
import PayloadCMS from "@/modules/common/icons/payloadcms";

const MedusaCTA = () => {
  const t = useTranslations("layout.footer");
  return (
    <p className="flex items-center gap-x-2">
      {t("poweredBy")}
      <a
        href="https://www.medusajs.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Medusa"
      >
        <Medusa fill="#9ca3af" className="fill-[#9ca3af]" />
      </a>
      &
      <a
        href="https://payloadcms.dev"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Payload CMS"
      >
        <PayloadCMS fill="#9ca3af" />
      </a>
      &
      <a
        href="https://nextjs.org"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Next.js"
      >
        <NextJs fill="#9ca3af" />
      </a>
    </p>
  );
};

export default MedusaCTA;
