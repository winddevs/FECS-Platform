import {
  EmailLocale,
  EmailTemplate,
  emailSubjects,
  getEmailSubject,
  renderTemplate,
  resolveTemplateLocale,
} from "@ecommerce/email";
import {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types";
import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils";
import { createTransport, type Transporter } from "nodemailer";

export type SmtpOptions = {
  /** Default smtp.resend.com */
  host?: string;
  /** Default 465 (implicit TLS). 587 / 2587 use STARTTLS. */
  port?: number | string;
  /** Implicit TLS. Default: true on port 465, false otherwise. */
  secure?: boolean | string;
  /** Default "resend" (Resend's SMTP user name). */
  user?: string;
  /** For Resend this is the API key. */
  password: string;
  from: string;
  html_templates?: Record<string, { subject?: string; content: string }>;
};

type InjectedDependencies = {
  logger: Logger;
};

const DEFAULT_HOST = "smtp.resend.com";
const DEFAULT_PORT = 465;
const DEFAULT_USER = "resend";
const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value === true || value === "true" || value === "1";
};

/** Transport settings from the provider options, with Resend's SMTP defaults. */
export const smtpTransportConfig = (options: SmtpOptions) => {
  const port = Number(options.port ?? DEFAULT_PORT);
  const user = options.user === undefined ? DEFAULT_USER : options.user;
  return {
    host: options.host || DEFAULT_HOST,
    port,
    secure: toBoolean(options.secure, port === DEFAULT_PORT),
    // An empty user means an open relay (local tests); Resend always needs both.
    auth: user ? { user, pass: options.password } : undefined,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  };
};

/**
 * Sends Medusa notifications on the `email` channel through SMTP (Resend:
 * smtp.resend.com:465, user `resend`, password = API key). Templates and
 * locales are the same as before: see packages/email.
 */
class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-smtp";
  private transport: Transporter;
  private options: SmtpOptions;
  private logger: Logger;

  constructor({ logger }: InjectedDependencies, options: SmtpOptions) {
    super();
    this.options = options;
    this.logger = logger;
    this.transport = createTransport(smtpTransportConfig(options));
  }

  static validateOptions(options: Record<string, unknown>) {
    if (options.user !== "" && !options.password) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `password` is required in the provider's options (for Resend: the API key)."
      );
    }
    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `from` is required in the provider's options."
      );
    }
  }

  getTemplateSubject(template: EmailTemplate, locale: EmailLocale) {
    // `html_templates[template].subject` overrides win, regardless of locale.
    if (this.options.html_templates?.[template]?.subject) {
      return this.options.html_templates[template].subject;
    }
    return getEmailSubject(template, locale) || "New Email";
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const template = notification.template as EmailTemplate;
    if (
      !(template in emailSubjects.vi) &&
      !this.options.html_templates?.[template]
    ) {
      this.logger.error(
        `Couldn't find an email template for ${notification.template}. The valid options are ${Object.keys(emailSubjects.vi).join(", ")}`
      );
      return {};
    }
    // `data.locale` -> `data.order.locale` -> `data.order.metadata.locale`
    // -> env EMAIL_DEFAULT_LOCALE (default "vi"), normalised to vi | en.
    const locale = resolveTemplateLocale(notification.data);
    let html: string;
    if (this.options.html_templates?.[template]) {
      html = this.options.html_templates[template].content;
    } else {
      try {
        html = await renderTemplate(template, notification.data, locale);
      } catch (error) {
        this.logger.error(
          `Failed to render email template ${template}`,
          error as Error
        );
        return {};
      }
    }
    // Medusa attachments carry base64 `content`.
    const attachments = notification.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      encoding: "base64" as const,
      contentType: attachment.content_type,
    }));
    try {
      const info = await this.transport.sendMail({
        from: this.options.from,
        to: notification.to,
        subject: this.getTemplateSubject(template, locale),
        html,
        ...(attachments?.length ? { attachments } : {}),
      });
      return { id: info.messageId };
    } catch (error) {
      // Never log the recipient or the credentials: only what failed.
      this.logger.error(
        `Failed to send email over SMTP: ${error instanceof Error ? error.message : String(error)}`
      );
      return {};
    }
  }
}

export default SmtpNotificationProviderService;
