import { render } from "react-email";

import {
  type EmailLocale,
  type EmailTemplate,
  emailSubjects,
  resolveEmailLocale,
  resolveNotificationLocale,
} from "./i18n";
import { OrderPlacedEmail } from "./templates/order-placed-email";
import { PasswordResetEmail } from "./templates/password-reset-email";
import { UserInvitedEmail } from "./templates/user-invited-email";

export { OrderPlacedEmail } from "./templates/order-placed-email";
export { PasswordResetEmail } from "./templates/password-reset-email";
export { UserInvitedEmail } from "./templates/user-invited-email";

export {
  DEFAULT_SUPPORT_ADDRESS,
  EMAIL_LOCALES,
  emailCopy,
  emailSubjects,
  getDefaultEmailLocale,
  getSupportAddress,
  normalizeEmailLocale,
  resolveEmailLocale,
  resolveNotificationLocale,
  resolveOrderLocale,
} from "./i18n";
export type { EmailLocale, EmailTemplate } from "./i18n";

export const emailTemplates: Record<
  EmailTemplate,
  (props: unknown, locale: EmailLocale) => React.ReactNode
> = {
  "order-placed": (props, locale) => (
    <OrderPlacedEmail
      {...(props as React.ComponentProps<typeof OrderPlacedEmail>)}
      locale={locale}
    />
  ),
  "password-reset": (props, locale) => (
    <PasswordResetEmail
      {...(props as React.ComponentProps<typeof PasswordResetEmail>)}
      locale={locale}
    />
  ),
  "user-invited": (props, locale) => (
    <UserInvitedEmail
      {...(props as React.ComponentProps<typeof UserInvitedEmail>)}
      locale={locale}
    />
  ),
};

/**
 * Locale used for a template: the explicit `locale` argument wins, otherwise it
 * is derived from the data (`data.locale`, `data.order.locale`,
 * `data.order.metadata.locale`) and finally env `EMAIL_DEFAULT_LOCALE`.
 */
export const resolveTemplateLocale = (
  data: unknown,
  locale?: EmailLocale | string | null
): EmailLocale => resolveEmailLocale(locale, resolveNotificationLocale(data));

/** Subject line for a template in the given locale. */
export const getEmailSubject = (
  template: EmailTemplate,
  locale: EmailLocale
): string => emailSubjects[locale][template];

export async function renderTemplate(
  template: EmailTemplate,
  data: unknown,
  locale?: EmailLocale
): Promise<string> {
  const component = emailTemplates[template];
  if (!component) {
    throw new Error(`Unknown email template: ${template}`);
  }
  const resolvedLocale = resolveTemplateLocale(data, locale);
  return render(component(data, resolvedLocale) as React.ReactElement);
}

/** The part of a nodemailer transport that `sendEmail` needs. */
export type MailTransport = {
  sendMail: (message: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }) => Promise<unknown>;
};

export async function sendEmail(
  transport: MailTransport,
  options: {
    from: string;
    to: string;
    template: EmailTemplate;
    data: unknown;
    locale?: EmailLocale;
  }
) {
  const locale = resolveTemplateLocale(options.data, options.locale);
  const html = await renderTemplate(options.template, options.data, locale);
  const subject = getEmailSubject(options.template, locale);

  return transport.sendMail({
    from: options.from,
    to: options.to,
    subject,
    html,
  });
}
