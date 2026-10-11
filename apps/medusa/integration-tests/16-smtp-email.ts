import { createServer, type Server } from "node:net";

import type { ExecArgs } from "@medusajs/framework/types";

import SmtpNotificationProviderService, {
  smtpTransportConfig,
} from "../src/modules/smtp/service";

const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  console.log(`  ok - ${msg}`);
};

type Captured = { from: string; to: string[]; data: string };

/** A bare-bones SMTP server: accepts one or more messages, keeps what it got. */
const startSmtpServer = async (): Promise<{
  server: Server;
  port: number;
  received: Captured[];
}> => {
  const received: Captured[] = [];
  const server = createServer((socket) => {
    let current: Captured = { from: "", to: [], data: "" };
    let inData = false;
    let buffer = "";
    socket.write("220 test ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (inData) {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end === -1) {
          return;
        }
        current.data = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        inData = false;
        received.push(current);
        current = { from: "", to: [], data: "" };
        socket.write("250 queued\r\n");
      }
      let newline = buffer.indexOf("\r\n");
      while (!inData && newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const command = line.toUpperCase();
        if (command.startsWith("EHLO") || command.startsWith("HELO")) {
          socket.write("250-test\r\n250 8BITMIME\r\n");
        } else if (command.startsWith("MAIL FROM:")) {
          current.from = line.slice(10);
          socket.write("250 ok\r\n");
        } else if (command.startsWith("RCPT TO:")) {
          current.to.push(line.slice(8));
          socket.write("250 ok\r\n");
        } else if (command === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (command === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("250 ok\r\n");
        }
        newline = buffer.indexOf("\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, port, received };
};

/** Decodes quoted-printable / base64 bodies enough to search the text. */
const readable = (raw: string): string => {
  const unfolded = raw.replace(/=\r?\n/g, "");
  return unfolded.replace(/=([0-9A-F]{2})/g, (_m, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
};

/** Email goes out over SMTP (Resend's smtp.resend.com:465 in production). */
export default async function test(_args: ExecArgs) {
  console.log("# defaults match Resend's SMTP service");
  const defaults = smtpTransportConfig({ password: "re_key", from: "a@b.vn" });
  assert(defaults.host === "smtp.resend.com", "host smtp.resend.com");
  assert(
    defaults.port === 465 && defaults.secure === true,
    "port 465 with TLS"
  );
  assert(
    defaults.auth?.user === "resend" && defaults.auth?.pass === "re_key",
    "user 'resend', password is the API key"
  );
  const starttls = smtpTransportConfig({
    port: "587",
    password: "k",
    from: "a@b.vn",
  });
  assert(
    starttls.port === 587 && starttls.secure === false,
    "port 587 uses STARTTLS (no implicit TLS)"
  );
  const bad = (() => {
    try {
      SmtpNotificationProviderService.validateOptions({ from: "a@b.vn" });
      return false;
    } catch {
      return true;
    }
  })();
  assert(bad, "a missing password is refused at start-up");

  console.log("# a Vietnamese order confirmation really goes over SMTP");
  const { server, port, received } = await startSmtpServer();
  const logged: string[] = [];
  const logger = {
    error: (message: string) => logged.push(message),
    warn: (message: string) => logged.push(message),
    info: () => undefined,
  } as never;
  const provider = new SmtpNotificationProviderService(
    { logger },
    {
      host: "127.0.0.1",
      port,
      secure: false,
      user: "", // open relay: no AUTH in this local test
      password: "",
      from: "FECS Fashion <shop@fecs.vn>",
    }
  );
  const order = {
    id: "order_1",
    display_id: 1001,
    email: "khach@example.com",
    currency_code: "vnd",
    created_at: "2026-10-11T03:00:00.000Z",
    locale: "vi-VN",
    summary: { raw_current_order_total: { value: "250000" } },
    total: 250000,
    subtotal: 250000,
    tax_total: 0,
    item_total: 250000,
    shipping_total: 0,
    discount_total: 0,
    shipping_address: {
      first_name: "Nguyễn",
      last_name: "Thị Hương",
      address_1: "12 Nguyễn Huệ",
      city: "Quận 1",
      province: "Thành phố Hồ Chí Minh",
      country_code: "vn",
      postal_code: "700000",
    },
    items: [
      {
        id: "item_1",
        title: "Áo thun Basic (đen)",
        product_title: "Áo thun Basic (đen)",
        quantity: 1,
        unit_price: 250000,
        total: 250000,
      },
    ],
  };
  const pdf = Buffer.from("%PDF-1.4 test").toString("base64");
  const result = await provider.send({
    to: "khach@example.com",
    channel: "email",
    template: "order-placed",
    data: { order },
    attachments: [
      {
        filename: "hoa-don.pdf",
        content: pdf,
        content_type: "application/pdf",
      },
    ],
  } as never);
  assert(
    typeof result.id === "string" && result.id.length > 0,
    "the provider returns the SMTP message id"
  );
  assert(received.length === 1, "the SMTP server received one message");
  const message = received[0];
  assert(
    message.to.some((r) => r.includes("khach@example.com")),
    "addressed to the customer"
  );
  assert(
    message.from.includes("shop@fecs.vn"),
    "sent from the configured sender"
  );
  assert(
    /Subject: =\?UTF-8\?/.test(message.data),
    "the Vietnamese subject is encoded for SMTP (RFC 2047)"
  );
  assert(
    /Content-Type: application\/pdf/i.test(message.data) &&
      message.data.includes("hoa-don.pdf"),
    "the invoice PDF is attached"
  );
  assert(
    message.data.includes(pdf.slice(0, 20)),
    "the attachment content is the original bytes (base64)"
  );
  assert(
    readable(message.data).includes('lang="vi"') ||
      readable(message.data).includes('lang=3D"vi"'),
    "the HTML is the Vietnamese template"
  );

  console.log("# a failing SMTP server never throws into the order flow");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const down = await provider.send({
    to: "khach@example.com",
    channel: "email",
    template: "password-reset",
    data: { reset_url: "https://shop.example/reset?token=x" },
  } as never);
  assert(
    Object.keys(down).length === 0 &&
      logged.some((m) => m.includes("Failed to send email over SMTP")),
    "a connection error is logged and swallowed (no secrets in the log)"
  );
  assert(
    !logged.join(" ").includes("khach@example.com"),
    "the recipient address is not written to the log"
  );
  console.log("INTEGRATION TEST PASSED");
}
