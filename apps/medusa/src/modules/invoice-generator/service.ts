import { dirname, join, resolve, sep } from "node:path";

import { MedusaService } from "@medusajs/framework/utils";
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pdfmake = require("pdfmake") as {
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setLocalAccessPolicy(policy: (path: string) => boolean): void;
  setUrlAccessPolicy(policy: (url: string) => boolean): void;
  createPdf(docDefinition: Record<string, unknown>): {
    getBuffer(): Promise<Buffer>;
  };
};

import {
  InferTypeOf,
  OrderAddressDTO,
  OrderDTO,
  OrderLineItemDTO,
} from "@medusajs/framework/types";
import axios from "axios";

import { Invoice } from "./models/invoice";
import { InvoiceConfig } from "./models/invoice-config";

// ---------------------------------------------------------------------------
// Fonts
//
// Helvetica (a PDF standard font) has no Vietnamese diacritics, so the invoice
// uses Roboto, which ships inside the `pdfmake` package (`fonts/Roboto`) and
// covers the full Vietnamese range. `pdfmake` is a dependency of apps/medusa,
// so the fonts are present in node_modules at runtime (also in the Docker
// image, which deploys apps/medusa's production dependencies).
//
// Helvetica stays registered: invoices cached before this change store
// `defaultStyle.font: "Helvetica"` in `pdfContent` and must still render.
// ---------------------------------------------------------------------------

const INVOICE_FONT = "Roboto";

const PDFMAKE_ROOT = dirname(require.resolve("pdfmake/package.json"));

const resolveRobotoFonts = (): Record<string, string> => {
  const fontsDirectory = join(PDFMAKE_ROOT, "fonts", "Roboto");
  return {
    normal: join(fontsDirectory, "Roboto-Regular.ttf"),
    bold: join(fontsDirectory, "Roboto-Medium.ttf"),
    italics: join(fontsDirectory, "Roboto-Italic.ttf"),
    bolditalics: join(fontsDirectory, "Roboto-MediumItalic.ttf"),
  };
};

const LEGACY_HELVETICA_FONTS = {
  normal: "Helvetica",
  bold: "Helvetica-Bold",
  italics: "Helvetica-Oblique",
  bolditalics: "Helvetica-BoldOblique",
};
const STANDARD_FONT_NAMES = new Set(Object.values(LEGACY_HELVETICA_FONTS));

// The document only ever needs pdfmake's own font files (or the built-in
// standard font names); logos are inlined as data URIs (see
// imageUrlToBase64). Deny everything else.
pdfmake.setLocalAccessPolicy(
  (path) =>
    STANDARD_FONT_NAMES.has(path) ||
    resolve(path).startsWith(`${PDFMAKE_ROOT}${sep}`)
);
pdfmake.setUrlAccessPolicy(() => false);

pdfmake.addFonts({
  [INVOICE_FONT]: resolveRobotoFonts(),
  Helvetica: LEGACY_HELVETICA_FONTS,
});

// ---------------------------------------------------------------------------
// Localisation
//
// Locale resolution: `order.locale` (Medusa core field, BCP 47, may be null)
// -> `order.metadata.locale` -> env `INVOICE_DEFAULT_LOCALE` (default "vi").
// "vi-VN" normalises to "vi"; anything other than vi/en is skipped.
// ---------------------------------------------------------------------------

type InvoiceLocale = "vi" | "en";

const INVOICE_LOCALES: readonly InvoiceLocale[] = ["vi", "en"];
const FALLBACK_INVOICE_LOCALE: InvoiceLocale = "vi";
const LOCALE_SEPARATOR = /[-_]/;

const INTL_TAGS: Record<InvoiceLocale, string> = {
  vi: "vi-VN",
  en: "en-US",
};

// Vietnamese invoices show dates in Vietnam time so a server running in UTC
// does not move late-evening orders to the previous day.
const DATE_TIME_ZONES: Record<InvoiceLocale, string | undefined> = {
  vi: "Asia/Ho_Chi_Minh",
  en: undefined,
};

type InvoiceLabels = {
  invoice: string;
  companyDetails: string;
  invoiceId: string;
  invoiceDate: string;
  orderId: string;
  orderDate: string;
  billTo: string;
  shipTo: string;
  noBillingAddress: string;
  noShippingAddress: string;
  item: string;
  quantity: string;
  unitPrice: string;
  total: string;
  grandTotal: string;
  subtotal: string;
  tax: string;
  shipping: string;
  discount: string;
  notes: string;
  thankYou: string;
  unknownItem: string;
  defaultCompanyName: string;
};

const INVOICE_LABELS: Record<InvoiceLocale, InvoiceLabels> = {
  vi: {
    invoice: "HÓA ĐƠN",
    companyDetails: "THÔNG TIN CÔNG TY",
    invoiceId: "Số hóa đơn:",
    invoiceDate: "Ngày lập:",
    orderId: "Mã đơn hàng:",
    orderDate: "Ngày đặt hàng:",
    billTo: "ĐỊA CHỈ THANH TOÁN",
    shipTo: "ĐỊA CHỈ GIAO HÀNG",
    noBillingAddress: "Chưa có địa chỉ thanh toán",
    noShippingAddress: "Chưa có địa chỉ giao hàng",
    item: "Sản phẩm",
    quantity: "Số lượng",
    unitPrice: "Đơn giá",
    total: "Thành tiền",
    grandTotal: "Tổng cộng:",
    subtotal: "Tạm tính:",
    tax: "Thuế:",
    shipping: "Phí vận chuyển:",
    discount: "Giảm giá:",
    notes: "Ghi chú",
    thankYou: "Cảm ơn bạn đã mua sắm cùng chúng tôi!",
    unknownItem: "Sản phẩm không xác định",
    defaultCompanyName: "Tên công ty",
  },
  en: {
    invoice: "INVOICE",
    companyDetails: "COMPANY DETAILS",
    invoiceId: "Invoice ID:",
    invoiceDate: "Invoice Date:",
    orderId: "Order ID:",
    orderDate: "Order Date:",
    billTo: "BILL TO",
    shipTo: "SHIP TO",
    noBillingAddress: "No billing address provided",
    noShippingAddress: "No shipping address provided",
    item: "Item",
    quantity: "Quantity",
    unitPrice: "Unit Price",
    total: "Total",
    grandTotal: "Total:",
    subtotal: "Subtotal:",
    tax: "Tax:",
    shipping: "Shipping:",
    discount: "Discount:",
    notes: "Notes",
    thankYou: "Thank you for your business!",
    unknownItem: "Unknown Item",
    defaultCompanyName: "Your Company Name",
  },
};

const normalizeInvoiceLocale = (value: unknown): InvoiceLocale | null => {
  if (typeof value !== "string") {
    return null;
  }
  const [language] = value.trim().toLowerCase().split(LOCALE_SEPARATOR);
  return INVOICE_LOCALES.find((locale) => locale === language) ?? null;
};

const resolveInvoiceLocale = (order: OrderDTO): InvoiceLocale =>
  normalizeInvoiceLocale(order.locale) ??
  normalizeInvoiceLocale(order.metadata?.locale) ??
  normalizeInvoiceLocale(process.env.INVOICE_DEFAULT_LOCALE) ??
  FALLBACK_INVOICE_LOCALE;

const formatMoney = (
  amount: number,
  currency: string,
  locale: InvoiceLocale
): string =>
  // Medusa v2 amounts are major units (250000 VND, 19.99 USD): no scaling.
  // vi-VN + VND renders as "250.000 ₫".
  new Intl.NumberFormat(INTL_TAGS[locale], {
    style: "currency",
    currency,
  }).format(amount);

const formatDate = (
  value: string | number | Date,
  locale: InvoiceLocale
): string =>
  new Date(value).toLocaleDateString(INTL_TAGS[locale], {
    timeZone: DATE_TIME_ZONES[locale],
  });

/**
 * Multi-line postal address. Vietnamese names are written family name first
 * (`last_name first_name`, e.g. "Nguyễn Thị Hương").
 */
const formatAddress = (
  address: OrderAddressDTO,
  locale: InvoiceLocale
): string => {
  const nameParts =
    locale === "vi"
      ? [address.last_name, address.first_name]
      : [address.first_name, address.last_name];
  const lines = [
    nameParts.filter(Boolean).join(" "),
    address.address_1,
    address.address_2,
    [address.city, address.province, address.postal_code]
      .filter(Boolean)
      .join(", "),
    address.country_code,
    address.phone,
  ];
  return lines.filter(Boolean).join("\n");
};

// ---------------------------------------------------------------------------

type GeneratePdfParams = {
  order: OrderDTO;
  items: OrderLineItemDTO[];
};

type TableLayoutNode = { table: { body: unknown[] } };

const tableHorizontalLineWidth = (i: number, node: TableLayoutNode): number =>
  i === 0 || i === node.table.body.length ? 0.8 : 0.3;

const tableHorizontalLineColor = (i: number, node: TableLayoutNode): string =>
  i === 0 || i === node.table.body.length ? "#cbd5e0" : "#e2e8f0";

class InvoiceGeneratorService extends MedusaService({
  InvoiceConfig,
  Invoice,
}) {
  async generatePdf(
    params: GeneratePdfParams & {
      invoice_id: string;
    }
  ): Promise<Buffer> {
    const invoice = await this.retrieveInvoice(params.invoice_id);

    // The generated document is cached on the invoice, including its `locale`
    // (see createInvoiceContent). Cached content is reused as it is, so an
    // invoice first generated in English stays English.
    const pdfContent = Object.keys(invoice.pdfContent).length
      ? invoice.pdfContent
      : await this.createInvoiceContent(params, invoice);

    await this.updateInvoices({
      id: invoice.id,
      pdfContent,
    });

    return pdfmake.createPdf(pdfContent as Record<string, unknown>).getBuffer();
  }

  private async createInvoiceContent(
    params: GeneratePdfParams,
    invoice: InferTypeOf<typeof Invoice>
  ): Promise<Record<string, unknown>> {
    const locale = resolveInvoiceLocale(params.order);
    const labels = INVOICE_LABELS[locale];
    const currency = params.order.currency_code;
    const money = (amount: number): string =>
      formatMoney(amount, currency, locale);

    // Get invoice configuration
    const invoiceConfigs = await this.listInvoiceConfigs();
    const config = invoiceConfigs[0] || {};

    // Create table for order items
    const itemsTable = [
      [
        { text: labels.item, style: "tableHeader" },
        { text: labels.quantity, style: "tableHeader" },
        { text: labels.unitPrice, style: "tableHeader" },
        { text: labels.total, style: "tableHeader" },
      ],
      ...params.items.map((item) => [
        { text: item.title || labels.unknownItem, style: "tableRow" },
        { text: item.quantity.toString(), style: "tableRow" },
        { text: money(Number(item.unit_price)), style: "tableRow" },
        { text: money(Number(item.total)), style: "tableRow" },
      ]),
    ];

    const invoiceId = `INV-${invoice.display_id.toString().padStart(6, "0")}`;
    const invoiceDate = formatDate(invoice.created_at, locale);
    const orderDate = formatDate(params.order.created_at, locale);

    // return the PDF content structure
    return {
      // Stored with the document so the language of a cached invoice is known.
      locale,
      info: { title: `${labels.invoice} ${invoiceId}` },
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      header: {
        margin: [40, 20, 40, 0],
        columns: [
          /** Company Logo */
          {
            width: "*",
            stack: [
              ...(config.company_logo
                ? [
                    {
                      image: await this.imageUrlToBase64(config.company_logo),
                      width: 80,
                      height: 40,
                      fit: [80, 40],
                      margin: [0, 0, 0, 10],
                    },
                  ]
                : []),
              {
                text: config.company_name || labels.defaultCompanyName,
                style: "companyName",
                margin: [0, 0, 0, 0],
              },
            ],
          },
          /** Invoice Title */
          {
            width: "auto",
            stack: [
              {
                text: labels.invoice,
                style: "invoiceTitle",
                alignment: "right",
                margin: [0, 0, 0, 0],
              },
            ],
          },
        ],
      },
      content: [
        {
          margin: [0, 20, 0, 0],
          columns: [
            /** Company Details */
            {
              width: "*",
              stack: [
                {
                  text: labels.companyDetails,
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                config.company_address && {
                  text: config.company_address,
                  style: "companyAddress",
                  margin: [0, 0, 0, 4],
                },
                config.company_phone && {
                  text: config.company_phone,
                  style: "companyContact",
                  margin: [0, 0, 0, 4],
                },
                config.company_email && {
                  text: config.company_email,
                  style: "companyContact",
                  margin: [0, 0, 0, 0],
                },
              ],
            },
            /** Invoice Details */
            {
              width: "auto",
              table: {
                widths: [80, 120],
                body: [
                  [
                    { text: labels.invoiceId, style: "label" },
                    { text: invoiceId, style: "value" },
                  ],
                  [
                    { text: labels.invoiceDate, style: "label" },
                    { text: invoiceDate, style: "value" },
                  ],
                  [
                    { text: labels.orderId, style: "label" },
                    {
                      text: params.order.display_id.toString().padStart(6, "0"),
                      style: "value",
                    },
                  ],
                  [
                    { text: labels.orderDate, style: "label" },
                    { text: orderDate, style: "value" },
                  ],
                ],
              },
              layout: "noBorders",
              margin: [0, 0, 0, 20],
            },
          ],
        },
        {
          text: "\n",
        },
        /** Billing and Shipping Addresses */
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: labels.billTo,
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: params.order.billing_address
                    ? formatAddress(params.order.billing_address, locale)
                    : labels.noBillingAddress,
                  style: "addressText",
                },
              ],
            },
            {
              width: "*",
              stack: [
                {
                  text: labels.shipTo,
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: params.order.shipping_address
                    ? formatAddress(params.order.shipping_address, locale)
                    : labels.noShippingAddress,
                  style: "addressText",
                },
              ],
            },
          ],
        },
        {
          text: "\n\n",
        },
        /** Items Table */
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            body: itemsTable,
          },
          layout: {
            fillColor: (rowIndex: number) =>
              rowIndex === 0 ? "#f8f9fa" : null,
            hLineWidth: tableHorizontalLineWidth,
            vLineWidth: () => 0.3,
            hLineColor: tableHorizontalLineColor,
            vLineColor: () => "#e2e8f0",
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
        },
        {
          text: "\n",
        },
        /** Totals Section */
        {
          columns: [
            { width: "*", text: "" },
            {
              width: "auto",
              table: {
                widths: ["auto", "auto"],
                body: [
                  [
                    { text: labels.subtotal, style: "totalLabel" },
                    {
                      text: money(Number(params.order.subtotal)),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: labels.tax, style: "totalLabel" },
                    {
                      text: money(Number(params.order.tax_total)),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: labels.shipping, style: "totalLabel" },
                    {
                      text: money(
                        Number(params.order.shipping_methods?.[0]?.total || 0)
                      ),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: labels.discount, style: "totalLabel" },
                    {
                      text: money(Number(params.order.discount_total)),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: labels.grandTotal, style: "totalLabel" },
                    {
                      text: money(Number(params.order.total)),
                      style: "totalValue",
                    },
                  ],
                ],
              },
              layout: {
                fillColor: (rowIndex: number) =>
                  rowIndex === 4 ? "#f8f9fa" : null,
                hLineWidth: tableHorizontalLineWidth,
                vLineWidth: () => 0.3,
                hLineColor: tableHorizontalLineColor,
                vLineColor: () => "#e2e8f0",
                paddingLeft: () => 8,
                paddingRight: () => 8,
                paddingTop: () => 6,
                paddingBottom: () => 6,
              },
            },
          ],
        },
        {
          text: "\n\n",
        },
        /** Notes Section */
        ...(config.notes
          ? [
              {
                text: labels.notes,
                style: "sectionHeader",
                margin: [0, 20, 0, 10],
              },
              {
                text: config.notes,
                style: "notesText",
                margin: [0, 0, 0, 20],
              },
            ]
          : []),
        {
          text: labels.thankYou,
          style: "thankYouText",
          alignment: "center",
          margin: [0, 30, 0, 0],
        },
      ],
      styles: {
        companyName: {
          fontSize: 22,
          bold: true,
          color: "#1a365d",
          margin: [0, 0, 0, 5],
        },
        companyAddress: {
          fontSize: 11,
          color: "#4a5568",
          lineHeight: 1.3,
        },
        companyContact: {
          fontSize: 10,
          color: "#4a5568",
        },
        invoiceTitle: {
          fontSize: 24,
          bold: true,
          color: "#2c3e50",
        },
        label: {
          fontSize: 10,
          color: "#6c757d",
          margin: [0, 0, 8, 0],
        },
        value: {
          fontSize: 10,
          bold: true,
          color: "#2c3e50",
        },
        sectionHeader: {
          fontSize: 12,
          bold: true,
          color: "#2c3e50",
          backgroundColor: "#f8f9fa",
          padding: [8, 12],
        },
        addressText: {
          fontSize: 10,
          color: "#495057",
          lineHeight: 1.3,
        },
        tableHeader: {
          fontSize: 10,
          bold: true,
          color: "#ffffff",
          fillColor: "#495057",
        },
        tableRow: {
          fontSize: 9,
          color: "#495057",
        },
        totalLabel: {
          fontSize: 10,
          bold: true,
          color: "#495057",
        },
        totalValue: {
          fontSize: 10,
          bold: true,
          color: "#2c3e50",
        },
        notesText: {
          fontSize: 10,
          color: "#6c757d",
          italics: true,
          lineHeight: 1.4,
        },
        thankYouText: {
          fontSize: 12,
          color: "#28a745",
          italics: true,
        },
      },
      defaultStyle: {
        font: INVOICE_FONT,
      },
    };
  }

  private async imageUrlToBase64(url: string): Promise<string> {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const base64 = Buffer.from(response.data).toString("base64");
    const mimeType = response.headers["content-type"] || "image/png";
    return `data:${mimeType};base64,${base64}`;
  }
}

export default InvoiceGeneratorService;
