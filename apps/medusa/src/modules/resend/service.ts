import {
  EmailLocale,
  EmailTemplate,
  emailSubjects,
  getEmailSubject,
  renderTemplate,
  resolveTemplateLocale,
} from "@ecommerce/email";
import {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
  Logger,
} from "@medusajs/framework/types";
import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils";
import { Resend } from "resend";

type ResendOptions = {
  api_key: string;
  from: string;
  html_templates?: Record<
    string,
    {
      subject?: string;
      content: string;
    }
  >;
};

type InjectedDependencies = {
  logger: Logger;
};

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend";
  private resendClient: Resend;
  private options: ResendOptions;
  private logger: Logger;

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super();
    this.resendClient = new Resend(options.api_key);
    this.options = options;
    this.logger = logger;
  }

  static validateOptions(options: Record<any, any>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `api_key` is required in the provider's options."
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

    const commonOptions = {
      from: this.options.from,
      to: [notification.to],
      subject: this.getTemplateSubject(template, locale),
    };

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

    // Medusa attachments carry base64 `content`, which is what Resend expects
    // for string content. Resend reads `contentType` (camelCase) and the
    // content id from `contentId`.
    const attachments = notification.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.content_type,
    }));

    const { data, error } = await this.resendClient.emails.send({
      ...commonOptions,
      html,
      ...(attachments?.length ? { attachments } : {}),
    });

    if (error || !data) {
      if (error) {
        this.logger.error("Failed to send email", error);
      } else {
        this.logger.error("Failed to send email: unknown error");
      }
      return {};
    }

    return { id: data.id };
  }
}

export default ResendNotificationProviderService;
