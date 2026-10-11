/**
 * Vietnamese translations of API error messages.
 *
 * Errors are thrown in English (`domainError(...)`, `new MedusaError(...)`,
 * Medusa's own validation) and translated when a request asks for Vietnamese
 * (see `requestLocale`). Only the human text changes: error `code`, `type`,
 * ids, SKUs, status codes and numbers are copied through unchanged.
 *
 * ORDER MATTERS: the first matching pattern wins, so specific patterns come
 * before general ones. `scripts/check-error-messages.mjs` (`npm run
 * i18n:errors`) fails when a message in src/ has no pattern here.
 *
 * Keep this file free of imports and non-erasable TypeScript (enums, parameter
 * properties): the coverage script loads it with `--experimental-strip-types`.
 */

type Match = RegExpExecArray;

/** A fixed text with `$1`-style groups, or a function (null = "not mine"). */
type Translation = string | ((match: Match) => string | null);

export type ErrorMessagePattern = { pattern: RegExp; vi: Translation };

export type ErrorLocale = "vi" | "en";

const group = (match: Match, index: number): string => match[index] ?? "";

/** " <text>" when the captured detail is not empty, else "". */
const detail = (match: Match, index: number): string => {
  const text = group(match, index).trim();
  return text === "" ? "" : ` ${text}`;
};

const lookup = (
  dictionary: Readonly<Record<string, string>>,
  key: string
): string | undefined => dictionary[key.toLowerCase()];

// ---------------------------------------------------------------------------
// Vocabulary used by the function translations below
// ---------------------------------------------------------------------------

const PURCHASE_ORDER_ACTIONS: Readonly<Record<string, string>> = {
  approve: "duyệt",
  send: "gửi",
  close: "đóng",
  cancel: "hủy",
};

const MATERIAL_FRAGMENTS: Readonly<Record<string, string>> = {
  "is inactive": "đã ngừng sử dụng",
  "is roll-tracked: provide rolls[]":
    "được theo dõi theo cuộn vải: hãy nhập rolls[]",
  "is not roll-tracked: do not provide rolls[]":
    "không theo dõi theo cuộn vải: không được nhập rolls[]",
  "is dye-lot tracked: a dye lot number is required":
    "được theo dõi theo lô nhuộm: bắt buộc nhập số lô nhuộm",
};

const VERSIONED_DOCUMENTS: Readonly<Record<string, string>> = {
  bom: "định mức nguyên liệu (BOM)",
  routing: "quy trình công đoạn",
};

const SETTING_SCOPES: Readonly<Record<string, string>> = {
  global: "toàn hệ thống",
  country: "quốc gia",
  warehouse: "kho",
};

const LIST_ENTITIES: Readonly<Record<string, string>> = {
  material: "nguyên phụ liệu",
  supplier: "nhà cung cấp",
  material_location: "vị trí kho",
};

const NAMED_DOCUMENTS: Readonly<Record<string, string>> = {
  roll: "cuộn vải",
  location: "vị trí kho",
  reservation: "giữ chỗ",
  bom: "định mức nguyên liệu (BOM)",
  "purchase order": "đơn mua hàng",
  "manufacturing order": "lệnh sản xuất",
  routing: "quy trình công đoạn",
  bundle: "bó bán thành phẩm",
};

const MEDUSA_ENTITIES: Readonly<Record<string, string>> = {
  product: "sản phẩm",
  "product variant": "biến thể sản phẩm",
  order: "đơn hàng",
  customer: "khách hàng",
  user: "người dùng",
  region: "khu vực",
  "sales channel": "kênh bán hàng",
  "stock location": "kho",
  "shipping option": "phương thức vận chuyển",
  "price list": "bảng giá",
  invite: "lời mời",
};

const VALUE_TYPES: Readonly<Record<string, string>> = {
  string: "chuỗi ký tự",
  number: "số",
  int: "số nguyên",
  integer: "số nguyên",
  boolean: "đúng/sai (boolean)",
  array: "mảng",
  object: "đối tượng",
  date: "ngày",
  null: "null",
  undefined: "không có giá trị",
  nan: "NaN",
};

const SIZE_UNITS: Readonly<Record<string, string>> = {
  characters: "ký tự",
  items: "phần tử",
  elements: "phần tử",
  bytes: "byte",
};

const FORMAT_NAMES: Readonly<Record<string, string>> = {
  "email address": "địa chỉ email",
  url: "URL",
  uuid: "UUID",
  uuidv4: "UUID v4",
  uuidv6: "UUID v6",
  guid: "GUID",
  nanoid: "nanoid",
  cuid: "cuid",
  cuid2: "cuid2",
  ulid: "ULID",
  xid: "XID",
  ksuid: "KSUID",
  emoji: "emoji",
  "iso datetime": "ngày giờ ISO",
  "iso date": "ngày ISO",
  "iso time": "giờ ISO",
  "iso duration": "khoảng thời gian ISO",
  "ipv4 address": "địa chỉ IPv4",
  "ipv6 address": "địa chỉ IPv6",
  "ipv4 range": "dải IPv4",
  "ipv6 range": "dải IPv6",
  "mac address": "địa chỉ MAC",
  "base64-encoded string": "chuỗi mã hóa base64",
  "base64url-encoded string": "chuỗi mã hóa base64url",
  "json string": "chuỗi JSON",
  "e.164 number": "số điện thoại E.164",
  jwt: "JWT",
  input: "dữ liệu",
};

const typeName = (name: string): string =>
  lookup(VALUE_TYPES, name.trim()) ?? name;

const joinTypeNames = (names: string): string =>
  names
    .split(", ")
    .map((name) => typeName(name))
    .join(", ");

const uppercaseFirst = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const ERROR_MESSAGE_PATTERNS: readonly ErrorMessagePattern[] = [
  // ---- Authorization -------------------------------------------------------
  {
    pattern: /^Missing permission: (.+)$/,
    vi: "Thiếu quyền: $1",
  },
  {
    pattern: /^An authenticated admin user is required$/,
    vi: "Cần đăng nhập bằng tài khoản quản trị",
  },
  {
    pattern: /^Unauthorized$/,
    vi: "Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn",
  },
  {
    pattern: /^Invalid token$/,
    vi: "Mã xác thực (token) không hợp lệ",
  },
  {
    pattern: /^Forbidden$/,
    vi: "Bạn không có quyền thực hiện thao tác này",
  },
  {
    pattern: /^Invalid email or password$/,
    vi: "Email hoặc mật khẩu không đúng",
  },

  // ---- Idempotency ---------------------------------------------------------
  {
    pattern: /^An Idempotency-Key header \(max (.+) chars\) is required$/,
    vi: "Cần có header Idempotency-Key (tối đa $1 ký tự)",
  },
  {
    pattern:
      /^IDEMPOTENCY_KEY_REUSED: key "(.+)" was already used with a different payload$/,
    vi: 'IDEMPOTENCY_KEY_REUSED: khóa "$1" đã được dùng cho một yêu cầu có nội dung khác',
  },
  {
    pattern: /^Idempotency record vanished for (.+)\/(.+)$/,
    vi: "Bản ghi idempotency cho $1/$2 không còn tồn tại",
  },
  {
    pattern:
      /^The request conflicted with another request\. You may retry the request with the provided Idempotency-Key\.$/,
    vi: "Yêu cầu bị xung đột với một yêu cầu khác. Bạn có thể gửi lại yêu cầu với cùng Idempotency-Key.",
  },

  // ---- Quantities and generic validation -----------------------------------
  {
    pattern: /^Pack quantity must be a positive whole number$/,
    vi: "Số lượng đóng gói phải là số nguyên dương",
  },
  {
    pattern: /^(.+) must be a positive number with at most (.+) decimals$/,
    vi: "$1 phải là số dương và có tối đa $2 chữ số thập phân",
  },
  {
    pattern: /^(.+) must be a positive whole number$/,
    vi: "$1 phải là số nguyên dương",
  },
  {
    pattern: /^Invalid quantity: (.+)$/,
    vi: "Số lượng không hợp lệ: $1",
  },
  {
    pattern: /^Quantities must be non-negative whole numbers$/,
    vi: "Số lượng phải là số nguyên không âm",
  },
  {
    pattern: /^counted_qty cannot be negative$/,
    vi: "counted_qty (số lượng kiểm đếm) không được âm",
  },
  {
    pattern: /^safety_stock must be >= 0$/,
    vi: "safety_stock (tồn kho an toàn) phải lớn hơn hoặc bằng 0",
  },
  {
    pattern:
      /^reorder_point and reorder_qty must be whole numbers of at least 0$/,
    vi: "reorder_point và reorder_qty phải là số nguyên, tối thiểu là 0",
  },
  {
    pattern:
      /^Provide exactly one of medusa_fulfillment_id, return_id or exchange_return_id$/,
    vi: "Chỉ được cung cấp đúng một trong các trường: medusa_fulfillment_id, return_id hoặc exchange_return_id",
  },

  // ---- Material inventory --------------------------------------------------
  {
    pattern: /^Duplicate roll_code in request$/,
    vi: "Yêu cầu có roll_code (mã cuộn vải) bị trùng",
  },
  {
    pattern: /^Roll code\(s\) already exist: (.+)$/,
    vi: "Mã cuộn vải đã tồn tại: $1",
  },
  {
    pattern: /^Roll quantities \((.+)\) must add up to line qty \((.+)\)$/,
    vi: "Tổng số lượng các cuộn vải ($1) phải bằng số lượng của dòng ($2)",
  },
  {
    pattern: /^Material (.+) is dye-lot tracked: a dye lot number is required$/,
    vi: "Nguyên phụ liệu $1 được theo dõi theo lô nhuộm: bắt buộc nhập số lô nhuộm",
  },
  {
    pattern: /^Material (.+) is inactive$/,
    vi: "Nguyên phụ liệu $1 đã ngừng sử dụng",
  },
  {
    pattern:
      /^Material (.+) is not roll-tracked: provide qty and omit rolls\[\]$/,
    vi: "Nguyên phụ liệu $1 không theo dõi theo cuộn vải: hãy nhập qty và bỏ rolls[]",
  },
  {
    pattern: /^Material (.+) is roll-tracked: provide rolls\[\] and omit qty$/,
    vi: "Nguyên phụ liệu $1 được theo dõi theo cuộn vải: hãy nhập rolls[] và bỏ qty",
  },
  {
    // Receipt validation prefixes the material code to a short reason.
    pattern: /^Material (.+?): (.+)$/,
    vi: (match) => {
      const reason = lookup(MATERIAL_FRAGMENTS, group(match, 2));
      return reason === undefined
        ? null
        : `Nguyên phụ liệu ${group(match, 1)}: ${reason}`;
    },
  },
  {
    pattern: /^Material is not reserved for this MO$/,
    vi: "Nguyên phụ liệu chưa được giữ chỗ cho lệnh sản xuất này",
  },
  {
    pattern:
      /^Material issued to an MO cannot be scrapped under the MO: return it as DAMAGED first, then scrap that stock$/,
    vi: "Nguyên phụ liệu đã xuất cho lệnh sản xuất không thể hủy bỏ trực tiếp theo lệnh: hãy trả lại với trạng thái DAMAGED trước, rồi hủy bỏ phần tồn kho đó",
  },
  {
    pattern: /^Location (.+) is inactive$/,
    vi: "Vị trí kho $1 đã ngừng sử dụng",
  },
  {
    pattern: /^Location (.+) is not an IN_TRANSIT location$/,
    vi: "Vị trí kho $1 không phải là vị trí IN_TRANSIT (hàng đang vận chuyển)",
  },
  {
    pattern:
      /^Location (.+) cannot be used as transit \(must be a non-sellable IN_TRANSIT location\)$/,
    vi: "Vị trí kho $1 không thể dùng làm kho trung chuyển (phải là vị trí IN_TRANSIT không bán được)",
  },
  {
    pattern: /^FG location (.+) is inactive$/,
    vi: "Vị trí kho thành phẩm $1 đã ngừng sử dụng",
  },
  {
    pattern: /^No active IN_TRANSIT finished-goods location exists$/,
    vi: "Không có vị trí kho thành phẩm IN_TRANSIT nào đang hoạt động",
  },
  {
    pattern: /^No active IN_TRANSIT location exists; create one first$/,
    vi: "Không có vị trí kho IN_TRANSIT nào đang hoạt động; hãy tạo một vị trí trước",
  },
  {
    pattern: /^Several IN_TRANSIT locations exist; pass transit_location_id$/,
    vi: "Có nhiều vị trí kho IN_TRANSIT; hãy truyền transit_location_id",
  },
  {
    pattern: /^Source and destination location are the same$/,
    vi: "Vị trí kho nguồn và vị trí kho đích giống nhau",
  },
  {
    pattern:
      /^Same-site moves use the direct transfer; dispatch is for another warehouse$/,
    vi: "Di chuyển trong cùng một kho dùng chuyển kho trực tiếp; điều chuyển (dispatch) chỉ dành cho kho khác",
  },
  {
    pattern:
      /^TRANSFER_BETWEEN_WAREHOUSES: dispatch the transfer and receive it at the destination$/,
    vi: "TRANSFER_BETWEEN_WAREHOUSES: hãy điều chuyển (dispatch) rồi nhận hàng tại kho đích",
  },
  {
    pattern: /^Transfer (.+) is already (.+)$/,
    vi: "Phiếu chuyển kho $1 đã ở trạng thái $2",
  },
  {
    pattern: /^Transfer (.+) not found$/,
    vi: "Không tìm thấy phiếu chuyển kho $1",
  },
  {
    pattern: /^Transfer not found$/,
    vi: "Không tìm thấy phiếu chuyển kho",
  },
  {
    pattern: /^Balance (.+) not found$/,
    vi: "Không tìm thấy số dư tồn kho $1",
  },
  {
    pattern: /^Balance (.+) was not locked$/,
    vi: "Số dư tồn kho $1 chưa được khóa",
  },
  {
    pattern:
      /^Balance changed since count started \(expected v(.+), now v(.+)\); recount$/,
    vi: "Số dư tồn kho đã thay đổi từ lúc bắt đầu kiểm kê (dự kiến v$1, hiện là v$2); hãy kiểm đếm lại",
  },
  {
    pattern: /^Insufficient available stock for (.+?): short by (.+) (\S+)$/,
    vi: "Không đủ tồn kho khả dụng cho $1: thiếu $2 $3",
  },
  {
    pattern: /^Insufficient available stock on balance (.+)$/,
    vi: "Không đủ tồn kho khả dụng trên số dư $1",
  },
  {
    pattern: /^Insufficient stock on balance (.+)$/,
    vi: "Không đủ tồn kho trên số dư $1",
  },
  {
    pattern: /^Insufficient free finished goods for (.+) \(free (.+)\)$/,
    vi: "Không đủ thành phẩm khả dụng cho $1 (khả dụng $2)",
  },
  {
    pattern: /^Stock changed concurrently; retry the reservation$/,
    vi: "Tồn kho vừa bị thay đổi đồng thời; hãy thử giữ chỗ lại",
  },
  {
    pattern:
      /^Requirement needs (.+) dye lots \(max (.+)\); planner approval required$/,
    vi: "Nhu cầu cần $1 lô nhuộm (tối đa $2); cần người lập kế hoạch phê duyệt",
  },
  {
    pattern: /^Reservation (.+) not found$/,
    vi: "Không tìm thấy giữ chỗ $1",
  },
  {
    pattern: /^Cannot release (.+); outstanding is (.+)$/,
    vi: "Không thể bỏ giữ chỗ $1; số lượng còn lại là $2",
  },
  {
    pattern: /^Cannot issue (.+); reserved outstanding is (.+)$/,
    vi: "Không thể xuất $1; số lượng giữ chỗ còn lại là $2",
  },
  {
    pattern: /^Cannot issue more than (?:is )?reserved for this MO$/,
    vi: "Không thể xuất vượt quá số lượng đã giữ chỗ cho lệnh sản xuất này",
  },
  {
    pattern: /^Return of (.+) exceeds net issued (.+)$/,
    vi: "Số lượng trả lại $1 vượt quá số lượng đã xuất ròng $2",
  },
  {
    pattern: /^Scrap requires a reason$/,
    vi: "Hủy bỏ cần có lý do",
  },
  {
    pattern:
      /^Scrap requires a business reference \(reference_type and reference_id\)$/,
    vi: "Hủy bỏ cần có chứng từ tham chiếu (reference_type và reference_id)",
  },
  {
    pattern: /^Stock adjustment requires a reason$/,
    vi: "Điều chỉnh tồn kho cần có lý do",
  },
  {
    pattern: /^Adjustment requires a reason$/,
    vi: "Điều chỉnh cần có lý do",
  },
  {
    pattern: /^Cycle count (.+) not found$/,
    vi: "Không tìm thấy phiếu kiểm kê $1",
  },
  {
    pattern: /^Cycle count is already (.+)$/,
    vi: "Phiếu kiểm kê đã ở trạng thái $1",
  },
  {
    pattern: /^Cycle count requires a reason$/,
    vi: "Kiểm kê cần có lý do",
  },
  {
    pattern:
      /^A cycle count must be approved by someone other than the counter$/,
    vi: "Phiếu kiểm kê phải được duyệt bởi người khác với người đã kiểm đếm",
  },

  // ---- Finished goods ------------------------------------------------------
  {
    pattern:
      /^Production receipts require a packing_record_id \(QC-released \+ packed\)$/,
    vi: "Phiếu nhập thành phẩm từ sản xuất cần có packing_record_id (đã được QC thông qua và đã đóng gói)",
  },
  {
    pattern: /^Packing record (.+) was already received$/,
    vi: "Phiếu đóng gói $1 đã được nhận vào kho",
  },
  {
    pattern: /^Allocation not found or not active$/,
    vi: "Không tìm thấy phân bổ hoặc phân bổ không còn hiệu lực",
  },

  // ---- Procurement ---------------------------------------------------------
  {
    pattern: /^A purchase order needs at least one line$/,
    vi: "Đơn mua hàng cần ít nhất một dòng",
  },
  {
    pattern: /^A goods receipt needs at least one line$/,
    vi: "Phiếu nhập kho cần ít nhất một dòng",
  },
  {
    pattern: /^Purchase order (.+) not found$/,
    vi: "Không tìm thấy đơn mua hàng $1",
  },
  {
    pattern:
      /^Purchase order (.+) is (.+); goods can only be received against SENT or PARTIALLY_RECEIVED orders$/,
    vi: "Đơn mua hàng $1 đang ở trạng thái $2; chỉ có thể nhập hàng theo đơn ở trạng thái SENT hoặc PARTIALLY_RECEIVED",
  },
  {
    pattern:
      /^Cannot cancel a purchase order that already has receipts; close it instead$/,
    vi: "Không thể hủy đơn mua hàng đã có phiếu nhập kho; hãy đóng đơn thay thế",
  },
  {
    pattern: /^Cannot (.+) a purchase order in status (.+)$/,
    vi: (match) => {
      const action = lookup(PURCHASE_ORDER_ACTIONS, group(match, 1));
      return `Không thể ${action ?? group(match, 1)} đơn mua hàng ở trạng thái ${group(match, 2)}`;
    },
  },
  {
    pattern: /^PO line (.+) does not belong to (.+)$/,
    vi: "Dòng đơn mua hàng $1 không thuộc $2",
  },
  {
    pattern: /^Line (.+) would exceed ordered (.+) \(\+(.+)% tolerance\)$/,
    vi: "Dòng $1 sẽ vượt số lượng đã đặt $2 (cho phép dung sai +$3%)",
  },
  {
    pattern: /^Goods receipt (.+) not found$/,
    vi: "Không tìm thấy phiếu nhập kho $1",
  },
  {
    pattern: /^Goods receipt is void$/,
    vi: "Phiếu nhập kho đã bị vô hiệu hóa",
  },
  {
    pattern: /^Only receipts awaiting inventory posting can be voided$/,
    vi: "Chỉ phiếu nhập kho đang chờ ghi sổ tồn kho mới có thể vô hiệu hóa",
  },
  {
    pattern: /^Supplier (.+) is (.+)$/,
    vi: "Nhà cung cấp $1 đang ở trạng thái $2",
  },
  {
    pattern:
      /^SUPPLIER_NOT_QUALIFIED: (.+) is not qualified for material\(s\) (.+)$/,
    vi: "SUPPLIER_NOT_QUALIFIED: nhà cung cấp $1 chưa đủ điều kiện cung cấp nguyên phụ liệu $2",
  },

  // ---- Manufacturing -------------------------------------------------------
  {
    pattern: /^A BOM needs at least one line$/,
    vi: "Định mức nguyên liệu (BOM) cần ít nhất một dòng",
  },
  {
    pattern: /^BOM (.+) not found$/,
    vi: "Không tìm thấy định mức nguyên liệu (BOM) $1",
  },
  {
    pattern: /^BOM is (.+)$/,
    vi: "Định mức nguyên liệu (BOM) đang ở trạng thái $1",
  },
  {
    pattern: /^A routing needs at least one operation$/,
    vi: "Quy trình công đoạn cần ít nhất một công đoạn",
  },
  {
    pattern: /^A routing must end with a QC gate operation$/,
    vi: "Quy trình công đoạn phải kết thúc bằng một công đoạn kiểm tra chất lượng (QC)",
  },
  {
    pattern: /^Operation seq values must be unique$/,
    vi: "Giá trị seq của các công đoạn phải là duy nhất",
  },
  {
    pattern: /^Routing (.+) not found$/,
    vi: "Không tìm thấy quy trình công đoạn $1",
  },
  {
    pattern: /^Routing has no operation after the last step$/,
    vi: "Quy trình công đoạn không có công đoạn nào sau bước cuối cùng",
  },
  {
    pattern: /^Routing is (.+)$/,
    vi: "Quy trình công đoạn đang ở trạng thái $1",
  },
  {
    pattern: /^No released (.+) for (.+)$/,
    vi: (match) => {
      const raw = group(match, 1);
      const key = Object.keys(VERSIONED_DOCUMENTS).find((name) =>
        raw.toLowerCase().includes(name)
      );
      const noun = key === undefined ? raw : VERSIONED_DOCUMENTS[key];
      return `Chưa có ${noun} đã phát hành (RELEASED) cho ${group(match, 2)}`;
    },
  },
  {
    pattern: /^A (.+) manufacturing order cannot be tied to a customer order$/,
    vi: "Lệnh sản xuất loại $1 không được gắn với đơn hàng của khách",
  },
  {
    pattern: /^An MTO manufacturing order needs customer_order_id$/,
    vi: "Lệnh sản xuất MTO (sản xuất theo đơn) cần có customer_order_id",
  },
  {
    pattern: /^A REWORK manufacturing order needs source_mo_id$/,
    vi: "Lệnh sản xuất REWORK (làm lại) cần có source_mo_id",
  },
  {
    pattern: /^source_mo_id is only for REWORK manufacturing orders$/,
    vi: "source_mo_id chỉ dùng cho lệnh sản xuất REWORK",
  },
  {
    pattern: /^Source order (.+) not found$/,
    vi: "Không tìm thấy lệnh nguồn $1",
  },
  {
    pattern: /^Source order (.+) is (.+); rework needs output to repair$/,
    vi: "Lệnh nguồn $1 đang ở trạng thái $2; làm lại cần có sản phẩm để sửa",
  },
  {
    pattern: /^Rework of (.+) pieces exceeds the (.+) pieces of (.+)$/,
    vi: "Số lượng làm lại $1 sản phẩm vượt quá $2 sản phẩm của $3",
  },
  {
    pattern: /^MO lines need positive whole-number quantities$/,
    vi: "Các dòng của lệnh sản xuất cần số lượng là số nguyên dương",
  },
  {
    pattern: /^Manufacturing order (.+) not found$/,
    vi: "Không tìm thấy lệnh sản xuất $1",
  },
  {
    pattern:
      /^Manufacturing order (.+) is (.+); shop-floor work is not allowed$/,
    vi: "Lệnh sản xuất $1 đang ở trạng thái $2; không được phép thao tác tại xưởng",
  },
  {
    pattern: /^Manufacturing order cannot move from (.+) to (.+)$/,
    vi: "Lệnh sản xuất không thể chuyển từ $1 sang $2",
  },
  {
    pattern: /^Manufacturing order is not on hold$/,
    vi: "Lệnh sản xuất không ở trạng thái tạm giữ",
  },
  {
    pattern: /^Material check is not possible in status (.+)$/,
    vi: "Không thể kiểm tra nguyên phụ liệu khi lệnh sản xuất ở trạng thái $1",
  },
  {
    pattern: /^Reservations are recorded in MATERIAL_CHECK, not (.+)$/,
    vi: "Việc giữ chỗ chỉ được ghi nhận ở trạng thái MATERIAL_CHECK, không phải $1",
  },
  {
    pattern: /^No requirement for material (.+)$/,
    vi: "Không có nhu cầu cho nguyên phụ liệu $1",
  },
  {
    pattern: /^No requirement for that material$/,
    vi: "Không có nhu cầu cho nguyên phụ liệu đó",
  },
  {
    pattern: /^Batch not found or already cut$/,
    vi: "Không tìm thấy mẻ cắt hoặc mẻ cắt đã được cắt",
  },
  {
    pattern: /^Batch quantities must add up to the MO quantity \((.+)\)$/,
    vi: "Tổng số lượng các mẻ cắt phải bằng số lượng của lệnh sản xuất ($1)",
  },
  {
    pattern: /^Create a cut plan for this batch before cutting$/,
    vi: "Hãy tạo kế hoạch cắt cho mẻ cắt này trước khi cắt",
  },
  {
    pattern: /^fabric_material_id does not match the cut plan of this batch$/,
    vi: "fabric_material_id không khớp với kế hoạch cắt của mẻ cắt này",
  },
  {
    pattern: /^No fabric has been issued to this MO; issue it before cutting$/,
    vi: "Chưa xuất vải cho lệnh sản xuất này; hãy xuất vải trước khi cắt",
  },
  {
    pattern:
      /^Cut would consume (.+) of fabric but only (.+) is still issued to this MO$/,
    vi: "Việc cắt sẽ dùng $1 vải nhưng lệnh sản xuất này chỉ còn $2 vải đã xuất",
  },
  {
    pattern: /^LAY_EXCEEDS_ROLL: roll (.+) holds (.+) but the plan cuts (.+)$/,
    vi: "LAY_EXCEEDS_ROLL: cuộn vải $1 chỉ có $2 nhưng kế hoạch cắt cần $3",
  },
  {
    pattern:
      /^ROLL_NOT_ASSIGNED: roll (.+) is not reserved for this MO's fabric$/,
    vi: "ROLL_NOT_ASSIGNED: cuộn vải $1 chưa được giữ chỗ cho vải của lệnh sản xuất này",
  },
  {
    pattern: /^SKU (.+) is not part of (.+)$/,
    vi: "SKU $1 không thuộc $2",
  },
  {
    pattern: /^OVERPRODUCTION_APPROVAL_REQUIRED: (.+)$/,
    vi: "OVERPRODUCTION_APPROVAL_REQUIRED: cần phê duyệt sản xuất vượt kế hoạch ($1)",
  },
  {
    pattern:
      /^MO_HAS_ISSUED_MATERIAL: return or scrap issued material first \((.+)\)$/,
    vi: "MO_HAS_ISSUED_MATERIAL: hãy trả lại hoặc hủy bỏ nguyên phụ liệu đã xuất trước ($1)",
  },
  {
    pattern: /^WIP still exists on the shop floor; scrap or finish it first$/,
    vi: "Vẫn còn bán thành phẩm đang sản xuất (WIP) tại xưởng; hãy hủy bỏ hoặc hoàn tất chúng trước",
  },
  {
    pattern:
      /^REWORK_OPEN: (.+) pieces still wait for rework; return or scrap them first$/,
    vi: "REWORK_OPEN: còn $1 sản phẩm đang chờ làm lại; hãy trả lại hoặc hủy bỏ chúng trước",
  },
  {
    pattern: /^Short-closing needs a reason$/,
    vi: "Đóng sớm lệnh sản xuất cần có lý do",
  },
  {
    pattern:
      /^Only a PARTIALLY_COMPLETED order can be short-closed \(this one is (.+)\)$/,
    vi: "Chỉ lệnh sản xuất ở trạng thái PARTIALLY_COMPLETED mới có thể đóng sớm (lệnh này đang ở $1)",
  },
  {
    pattern: /^Suggestion not found$/,
    vi: "Không tìm thấy đề xuất",
  },
  {
    pattern: /^Suggestion already (.+)$/,
    vi: "Đề xuất đã ở trạng thái $1",
  },
  {
    pattern: /^Work center (.+) not found$/,
    vi: "Không tìm thấy trạm sản xuất $1",
  },
  {
    pattern:
      /^WORK_CENTER_TYPE_MISMATCH: operation (.+) runs on (.+), not (.+) \((.+)\)$/,
    vi: "WORK_CENTER_TYPE_MISMATCH: công đoạn $1 chạy trên trạm loại $2, không phải loại $3 ($4)",
  },
  {
    pattern: /^WORK_CENTER_UNAVAILABLE: (.+) is not active$/,
    vi: "WORK_CENTER_UNAVAILABLE: trạm sản xuất $1 không hoạt động",
  },

  // ---- Bundles, shop floor and quality -------------------------------------
  {
    pattern: /^Bundle (.+) not found$/,
    vi: "Không tìm thấy bó bán thành phẩm $1",
  },
  {
    pattern: /^Bundle is at operation (.+), not (.+)$/,
    vi: "Bó bán thành phẩm đang ở công đoạn $1, không phải công đoạn $2",
  },
  {
    pattern: /^Bundle quantities are inconsistent$/,
    vi: "Số lượng của bó bán thành phẩm không nhất quán",
  },
  {
    pattern: /^Bundle quantities must be positive whole numbers$/,
    vi: "Số lượng bó bán thành phẩm phải là số nguyên dương",
  },
  {
    pattern: /^No operation with seq (.+)$/,
    vi: "Không có công đoạn nào với seq $1",
  },
  {
    pattern: /^Operation (.+) is a QC gate: it is completed by an inspection$/,
    vi: "Công đoạn $1 là điểm kiểm soát chất lượng (QC): công đoạn này được hoàn thành bằng phiếu kiểm tra",
  },
  {
    pattern: /^Operation (.+) is not a QC gate$/,
    vi: "Công đoạn $1 không phải là điểm kiểm soát chất lượng (QC)",
  },
  {
    pattern: /^good \+ rework \+ reject cannot exceed input$/,
    vi: "Số đạt + làm lại + loại bỏ không được vượt quá số lượng đầu vào",
  },
  {
    pattern: /^Only (.+) pcs are waiting at this operation$/,
    vi: "Chỉ có $1 sản phẩm đang chờ tại công đoạn này",
  },
  {
    pattern: /^Only (.+) pcs are waiting for inspection$/,
    vi: "Chỉ có $1 sản phẩm đang chờ kiểm tra",
  },
  {
    pattern: /^Only (.+) pcs are in rework$/,
    vi: "Chỉ có $1 sản phẩm đang chờ làm lại",
  },
  {
    pattern: /^Only (.+) QC-released pcs can be packed$/,
    vi: "Chỉ có thể đóng gói $1 sản phẩm đã được QC thông qua",
  },
  {
    pattern: /^Provide repaired and\/or scrapped rework quantity$/,
    vi: "Hãy nhập số lượng làm lại đã sửa và/hoặc đã hủy bỏ",
  },
  {
    pattern:
      /^An inspection needs non-negative quantities that add up to more than zero$/,
    vi: "Phiếu kiểm tra cần số lượng không âm và tổng lớn hơn 0",
  },
  {
    pattern:
      /^SAMPLE_NOT_SELLABLE: output of a SAMPLE order cannot go to the sellable location (.+)$/,
    vi: "SAMPLE_NOT_SELLABLE: sản phẩm của lệnh sản xuất SAMPLE (hàng mẫu) không được nhập vào vị trí kho có thể bán $1",
  },

  // ---- Shipments -----------------------------------------------------------
  {
    pattern: /^Shipment not found$/,
    vi: "Không tìm thấy vận đơn",
  },
  {
    pattern: /^Shipment creation is already in progress$/,
    vi: "Vận đơn đang được tạo",
  },
  {
    pattern: /^Shipment was cancelled; it will not be created at the carrier$/,
    vi: "Vận đơn đã bị hủy; sẽ không tạo vận đơn tại đơn vị vận chuyển",
  },
  {
    pattern: /^Shipment is (.+) and can no longer be cancelled$/,
    vi: "Vận đơn đang ở trạng thái $1 và không thể hủy nữa",
  },
  {
    pattern: /^Shipment was already replaced$/,
    vi: "Vận đơn đã được thay thế",
  },
  {
    pattern: /^Replacing a shipment needs a reason$/,
    vi: "Thay thế vận đơn cần có lý do",
  },
  {
    pattern:
      /^A (.+) shipment may still be on its way: cancel it, or wait until it is returned, before replacing it$/,
    vi: "Vận đơn đang ở trạng thái $1 có thể vẫn đang trên đường giao: hãy hủy vận đơn, hoặc chờ hàng được trả về, rồi mới thay thế",
  },
  {
    pattern:
      /^Carrier rejected this shipment permanently; fix the data and create a replacement$/,
    vi: "Đơn vị vận chuyển đã từ chối vận đơn này vĩnh viễn; hãy sửa dữ liệu và tạo vận đơn thay thế",
  },
  {
    pattern:
      /^The carrier could not confirm whether a parcel exists; retry the cancel$/,
    vi: "Đơn vị vận chuyển không xác nhận được kiện hàng có tồn tại hay không; hãy thử hủy lại",
  },
  {
    pattern: /^Exception not found$/,
    vi: "Không tìm thấy ngoại lệ",
  },
  {
    pattern: /^Exception is already resolved$/,
    vi: "Ngoại lệ này đã được xử lý",
  },
  {
    pattern: /^A resolution needs a note$/,
    vi: "Việc xử lý cần có ghi chú",
  },

  // ---- Returns and refunds -------------------------------------------------
  {
    pattern: /^Return item not found$/,
    vi: "Không tìm thấy dòng hàng trả",
  },
  {
    pattern: /^Return (.+) not found$/,
    vi: "Không tìm thấy phiếu trả hàng $1",
  },
  {
    pattern: /^Return (.+) cannot move from (.+) to (.+)$/,
    vi: "Phiếu trả hàng $1 không thể chuyển từ $2 sang $3",
  },
  {
    pattern: /^Return not found$/,
    vi: "Không tìm thấy phiếu trả hàng",
  },
  {
    pattern: /^Return items need positive whole quantities$/,
    vi: "Các dòng hàng trả cần số lượng là số nguyên dương",
  },
  {
    pattern: /^Order not found$/,
    vi: "Không tìm thấy đơn hàng",
  },
  {
    pattern: /^Order line (.+) is not part of this order or has no SKU$/,
    vi: "Dòng đơn hàng $1 không thuộc đơn hàng này hoặc không có SKU",
  },
  {
    pattern: /^An exchange needs exchange_sku$/,
    vi: "Đổi hàng cần có exchange_sku",
  },
  {
    pattern: /^Exchange SKU (.+) does not exist$/,
    vi: "SKU đổi hàng $1 không tồn tại",
  },
  {
    pattern:
      /^EXCHANGE_STOCK_NOT_RESERVED: (.+) x (.+) is not reserved for this exchange$/,
    vi: "EXCHANGE_STOCK_NOT_RESERVED: $1 x $2 chưa được giữ chỗ cho lần đổi hàng này",
  },
  {
    pattern: /^Only an exchange has a replacement to send$/,
    vi: "Chỉ phiếu đổi hàng mới có hàng thay thế để gửi",
  },
  {
    pattern:
      /^The replacement is sent after the returned goods arrive \(this return is (.+)\)$/,
    vi: "Hàng thay thế chỉ được gửi sau khi hàng trả về đến nơi (phiếu trả hàng này đang ở trạng thái $1)",
  },
  {
    pattern: /^The order has no shipping address to send the replacement to$/,
    vi: "Đơn hàng chưa có địa chỉ giao hàng để gửi hàng thay thế",
  },
  {
    pattern: /^NOT_ELIGIBLE: (.+) - an override reason is required$/,
    vi: "NOT_ELIGIBLE: $1 - cần nhập lý do ghi đè",
  },
  {
    pattern:
      /^Items can be inspected only once the return is RECEIVED \(is (.+)\)$/,
    vi: "Chỉ có thể kiểm tra hàng khi phiếu trả hàng đã ở trạng thái RECEIVED (hiện là $1)",
  },
  {
    pattern: /^(.+) stock must never enter a sellable location$/,
    vi: "Hàng thuộc cách xử lý $1 không được nhập vào vị trí kho có thể bán",
  },
  {
    pattern: /^A-grade returns must be restocked to a sellable location$/,
    vi: "Hàng trả loại A phải được nhập lại vào vị trí kho có thể bán",
  },
  {
    pattern: /^A destination location is required for this disposition$/,
    vi: "Cần chọn vị trí kho đích cho cách xử lý này",
  },
  {
    pattern: /^Returned stock has not been posted yet; finish return QC first$/,
    vi: "Hàng trả chưa được ghi sổ tồn kho; hãy hoàn tất kiểm tra chất lượng hàng trả trước",
  },
  {
    pattern: /^Refunds are possible only after return QC$/,
    vi: "Chỉ có thể hoàn tiền sau khi kiểm tra chất lượng hàng trả (QC)",
  },
  {
    pattern: /^A refund amount is required$/,
    vi: "Cần nhập số tiền hoàn",
  },
  {
    pattern: /^A refund for this return is already in progress$/,
    vi: "Khoản hoàn tiền cho phiếu trả hàng này đang được xử lý",
  },
  {
    pattern:
      /^Refund of (.+) exceeds the refundable value (.+) of the returned items$/,
    vi: "Số tiền hoàn $1 vượt quá giá trị có thể hoàn $2 của các sản phẩm trả lại",
  },
  {
    pattern: /^That payment does not belong to the order of this return$/,
    vi: "Khoản thanh toán đó không thuộc đơn hàng của phiếu trả hàng này",
  },

  // ---- Social commerce -----------------------------------------------------
  {
    pattern: /^Conversation not found$/,
    vi: "Không tìm thấy cuộc hội thoại",
  },
  {
    pattern: /^The reply cannot be sent: (.+)$/,
    vi: "Không thể gửi phản hồi: $1",
  },

  // ---- Payload CMS, media and integrations ----------------------------------
  {
    pattern: /^Payload server URL is required$/,
    vi: "Cần cấu hình URL máy chủ Payload",
  },
  {
    pattern: /^Payload API key is required$/,
    vi: "Cần cấu hình khóa API của Payload",
  },
  {
    pattern: /^Payload API error: (\S+) (.+?)\.(?=\s|$)\s?(.*)$/,
    vi: (match) =>
      `Lỗi API của Payload: ${group(match, 1)} ${group(match, 2)}.${detail(match, 3)}`,
  },
  {
    pattern: /^Payload media upload failed: (.+?)\.(?=\s|$)\s?(.*)$/,
    vi: (match) =>
      `Tải tệp phương tiện lên Payload thất bại: ${group(match, 1)}.${detail(match, 2)}`,
  },
  {
    pattern: /^Failed to communicate with Payload CMS: (.+)$/,
    vi: "Không thể kết nối với Payload CMS: $1",
  },
  {
    pattern: /^Failed to download file from (.+?): (.+)$/,
    vi: "Không thể tải tệp từ $1: $2",
  },
  {
    pattern: /^Failed to upload image for product (.+?): (.+)$/,
    vi: "Không thể tải ảnh lên cho sản phẩm $1: $2",
  },
  {
    pattern: /^Unknown collection$/,
    vi: "Bộ sưu tập Payload không xác định",
  },
  {
    pattern: /^Option `api_key` is required in the provider's options\.$/,
    vi: "Tùy chọn `api_key` là bắt buộc trong cấu hình của nhà cung cấp dịch vụ.",
  },
  {
    pattern: /^Option `from` is required in the provider's options\.$/,
    vi: "Tùy chọn `from` là bắt buộc trong cấu hình của nhà cung cấp dịch vụ.",
  },
  {
    pattern: /^This is a test error for Sentry integration\.$/,
    vi: "Đây là lỗi thử nghiệm cho tích hợp Sentry.",
  },

  // ---- Responses written directly by admin routes --------------------------
  {
    pattern:
      /^(Roll|Location|Reservation|BOM|Purchase order|Manufacturing order|Routing|Bundle) not found$/i,
    vi: (match) => {
      const noun = lookup(NAMED_DOCUMENTS, group(match, 1));
      return noun === undefined ? null : `Không tìm thấy ${noun}`;
    },
  },
  {
    pattern: /^([a-z_]+) (\S+) not found$/,
    vi: (match) => {
      const entity = group(match, 1);
      return `Không tìm thấy ${lookup(LIST_ENTITIES, entity) ?? entity} ${group(match, 2)}`;
    },
  },
  {
    pattern: /^Label type must be roll or location$/,
    vi: "Loại nhãn phải là roll (cuộn vải) hoặc location (vị trí kho)",
  },
  {
    pattern: /^Nothing is registered under that code$/,
    vi: "Không có đối tượng nào được đăng ký với mã này",
  },
  {
    pattern: /^Unknown mart$/,
    vi: "Bảng phân tích (mart) không xác định",
  },
  {
    pattern: /^Unknown setting$/,
    vi: "Cài đặt không xác định",
  },
  {
    pattern: /^(.+) cannot be set per (.+)$/,
    vi: (match) => {
      const scope = lookup(SETTING_SCOPES, group(match, 2));
      return scope === undefined
        ? null
        : `${group(match, 1)} không thể đặt riêng theo ${scope} (${group(match, 2)})`;
    },
  },
  {
    pattern: /^scope_id is required for a country or warehouse override$/,
    vi: "Cần có scope_id khi ghi đè theo quốc gia hoặc theo kho",
  },
  {
    pattern: /^scope_type must be GLOBAL, COUNTRY or WAREHOUSE$/,
    vi: "scope_type phải là GLOBAL, COUNTRY hoặc WAREHOUSE",
  },
  {
    pattern: /^Invalid value for (.+?): (.+)$/,
    vi: (match) =>
      `Giá trị không hợp lệ cho ${group(match, 1)}: ${translateLenient(group(match, 2))}`,
  },

  // ---- Medusa: request validation (zod) --------------------------------------
  {
    // zod-validation-error appends the path: `<message> at "items[0].qty"`.
    pattern: /^(.+) at "(.+)"$/,
    vi: (match) => {
      const inner = translateStrict(group(match, 1));
      return inner === null ? null : `${inner} (tại "${group(match, 2)}")`;
    },
  },

  {
    pattern: /^Invalid request: (.+)$/,
    vi: (match) => `Yêu cầu không hợp lệ: ${translateLenient(group(match, 1))}`,
  },
  {
    pattern: /^Field '([^']+)' is required$/,
    vi: "Trường '$1' là bắt buộc",
  },
  {
    pattern: /^Expected type: '([^']+)' for field '([^']+)', got: '(.*)'$/,
    vi: (match) =>
      `Trường '${group(match, 2)}' phải có kiểu '${joinTypeNames(group(match, 1))}', nhưng nhận được: '${group(match, 3)}'`,
  },
  {
    pattern: /^Expected: '([^']+)' for field '([^']+)', but got: '(.*)'$/,
    vi: "Trường '$2' chỉ nhận một trong các giá trị: '$1', nhưng nhận được: '$3'",
  },
  {
    pattern: /^Unrecognized fields: '(.+)'$/,
    vi: "Có trường không được hỗ trợ: '$1'",
  },
  {
    pattern:
      /^Value for field '([^']+)' too small, expected at least: '([^']+)'$/,
    vi: "Giá trị của trường '$1' quá nhỏ, tối thiểu là: '$2'",
  },
  {
    pattern: /^Value for field '([^']+)' too big, expected at most: '([^']+)'$/,
    vi: "Giá trị của trường '$1' quá lớn, tối đa là: '$2'",
  },
  {
    pattern: /^Value for field '([^']+)' not multiple of: '([^']+)'$/,
    vi: "Giá trị của trường '$1' phải là bội số của: '$2'",
  },
  {
    pattern: /^Invalid input: expected (.+), received (.+)$/,
    vi: (match) =>
      `Dữ liệu không hợp lệ: cần ${typeName(group(match, 1))}, nhận được ${typeName(group(match, 2))}`,
  },
  {
    pattern: /^Invalid input: expected (.+)$/,
    vi: (match) => `Dữ liệu không hợp lệ: cần ${typeName(group(match, 1))}`,
  },
  {
    pattern: /^Invalid option: expected one of (.+)$/,
    vi: "Lựa chọn không hợp lệ: chỉ nhận một trong các giá trị $1",
  },
  {
    pattern:
      /^Too big: expected (.+) to have (<=|<)(.+) (characters|items|elements|bytes)$/,
    vi: (match) => {
      const limit = group(match, 2) === "<=" ? "tối đa" : "ít hơn";
      const unit = lookup(SIZE_UNITS, group(match, 4)) ?? group(match, 4);
      return `Quá lớn: ${typeName(group(match, 1))} chỉ được có ${limit} ${group(match, 3)} ${unit}`;
    },
  },
  {
    pattern: /^Too big: expected (.+) to be (<=|<)(.+)$/,
    vi: (match) => {
      const limit = group(match, 2) === "<=" ? "nhỏ hơn hoặc bằng" : "nhỏ hơn";
      return `Quá lớn: ${typeName(group(match, 1))} phải ${limit} ${group(match, 3)}`;
    },
  },
  {
    pattern:
      /^Too small: expected (.+) to have (>=|>)(.+) (characters|items|elements|bytes)$/,
    vi: (match) => {
      const limit = group(match, 2) === ">=" ? "ít nhất" : "nhiều hơn";
      const unit = lookup(SIZE_UNITS, group(match, 4)) ?? group(match, 4);
      return `Quá nhỏ: ${typeName(group(match, 1))} phải có ${limit} ${group(match, 3)} ${unit}`;
    },
  },
  {
    pattern: /^Too small: expected (.+) to be (>=|>)(.+)$/,
    vi: (match) => {
      const limit = group(match, 2) === ">=" ? "lớn hơn hoặc bằng" : "lớn hơn";
      return `Quá nhỏ: ${typeName(group(match, 1))} phải ${limit} ${group(match, 3)}`;
    },
  },
  {
    pattern: /^Invalid string: must start with "(.*)"$/,
    vi: 'Chuỗi không hợp lệ: phải bắt đầu bằng "$1"',
  },
  {
    pattern: /^Invalid string: must end with "(.*)"$/,
    vi: 'Chuỗi không hợp lệ: phải kết thúc bằng "$1"',
  },
  {
    pattern: /^Invalid string: must include "(.*)"$/,
    vi: 'Chuỗi không hợp lệ: phải chứa "$1"',
  },
  {
    pattern: /^Invalid string: must match pattern (.+)$/,
    vi: "Chuỗi không hợp lệ: phải khớp với mẫu $1",
  },
  {
    pattern: /^Invalid number: must be a multiple of (.+)$/,
    vi: "Số không hợp lệ: phải là bội số của $1",
  },
  {
    pattern: /^Unrecognized keys?: (.+)$/,
    vi: "Có trường không được hỗ trợ: $1",
  },
  {
    pattern: /^Invalid key in (.+)$/,
    vi: "Khóa không hợp lệ trong $1",
  },
  {
    pattern: /^Invalid value in (.+)$/,
    vi: "Giá trị không hợp lệ trong $1",
  },
  {
    pattern:
      /^Invalid (email address|URL|UUID|UUIDv4|UUIDv6|GUID|nanoid|cuid2?|ULID|XID|KSUID|emoji|ISO datetime|ISO date|ISO time|ISO duration|IPv4 address|IPv6 address|IPv4 range|IPv6 range|MAC address|base64-encoded string|base64url-encoded string|JSON string|E\.164 number|JWT)$/,
    vi: (match) => {
      const name = lookup(FORMAT_NAMES, group(match, 1)) ?? group(match, 1);
      return `${uppercaseFirst(name)} không hợp lệ`;
    },
  },
  {
    pattern: /^Invalid input$/,
    vi: "Dữ liệu không hợp lệ",
  },
  {
    pattern: /^Required$/,
    vi: "Bắt buộc",
  },
  {
    pattern:
      /^Expected (string|number|boolean|array|object|date|int|integer|null|undefined), received (\w+)$/,
    vi: (match) =>
      `Cần ${typeName(group(match, 1))}, nhận được ${typeName(group(match, 2))}`,
  },
  {
    pattern: /^At most (\d+) decimal places$/,
    vi: "Tối đa $1 chữ số thập phân",
  },
  // ---- Medusa: common runtime messages ---------------------------------------
  {
    pattern: /^(.+?) with ([\w.]+): (.+) was not found$/,
    vi: (match) => {
      const entity = lookup(MEDUSA_ENTITIES, group(match, 1));
      return `Không tìm thấy ${entity ?? group(match, 1)} có ${group(match, 2)}: ${group(match, 3)}`;
    },
  },
  {
    pattern: /^(.+?) with (.+) does not exist\.?$/,
    vi: (match) => {
      const entity = lookup(MEDUSA_ENTITIES, group(match, 1));
      return `${uppercaseFirst(entity ?? group(match, 1))} với ${group(match, 2)} không tồn tại`;
    },
  },
  {
    pattern: /^Can't insert null value in field (.+) on insert in table (.+)$/,
    vi: "Không thể ghi giá trị rỗng vào trường $1 của bảng $2",
  },
  {
    pattern: /^Not [Ff]ound$/,
    vi: "Không tìm thấy",
  },
  {
    pattern: /^An unknown error occurred\.?$/,
    vi: "Đã xảy ra lỗi không xác định",
  },
  {
    pattern: /^request entity too large$/i,
    vi: "Nội dung yêu cầu quá lớn",
  },
  {
    pattern:
      /^(?:Unexpected token .*|Unexpected end of JSON input.*|Expected property name .*|.* is not valid JSON.*)$/,
    vi: "Nội dung yêu cầu không phải JSON hợp lệ",
  },
];

// ---------------------------------------------------------------------------
// Matching engine
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\$(\d)/g;
// Sentence/line boundaries: keep the punctuation with the sentence it ends.
const SEGMENT_BOUNDARY = /((?<=[.;])\s+|\n+)/;
const TRAILING_PUNCTUATION = /^([\s\S]*?)([.;])$/;

const render = (translation: Translation, match: Match): string | null =>
  typeof translation === "function"
    ? translation(match)
    : translation.replace(PLACEHOLDER, (_whole, index: string) =>
        group(match, Number(index))
      );

/** Translate a message that is exactly one table entry, else null. */
const translateWhole = (message: string): string | null => {
  for (const { pattern, vi } of ERROR_MESSAGE_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      const rendered = render(vi, match);
      if (rendered !== null) {
        return rendered;
      }
    }
  }
  return null;
};

/** One sentence, with or without its closing "." or ";". */
const translateSentence = (sentence: string): string | null => {
  const direct = translateWhole(sentence);
  if (direct !== null) {
    return direct;
  }
  const split = TRAILING_PUNCTUATION.exec(sentence);
  if (!split) {
    return null;
  }
  const translated = translateWhole(group(split, 1));
  return translated === null ? null : `${translated}${group(split, 2)}`;
};

const isBoundary = (index: number): boolean => index % 2 === 1;

/**
 * Whole message first; otherwise split into sentences/lines and translate
 * each. `strict` returns null unless EVERY sentence was translated.
 */
const translateParts = (message: string, strict: boolean): string | null => {
  const parts = message.split(SEGMENT_BOUNDARY);
  // Several sentences: when every one has its own pattern, that wins over a
  // greedy single pattern (`Return (.+) not found`) swallowing all of them.
  let translatedAny = false;
  let complete = true;
  const sentences =
    parts.length < 3
      ? null
      : parts.map((part, index) => {
          if (isBoundary(index) || part.trim() === "") {
            return part;
          }
          const translated = translateSentence(part);
          if (translated === null) {
            complete = false;
            return part;
          }
          translatedAny = true;
          return translated;
        });
  if (sentences !== null && complete && translatedAny) {
    return sentences.join("");
  }
  const whole = translateSentence(message);
  if (whole !== null) {
    return whole;
  }
  if (strict) {
    return null;
  }
  return sentences !== null && translatedAny ? sentences.join("") : message;
};

const translateStrict = (message: string): string | null =>
  translateParts(message, true);

const translateLenient = (message: string): string =>
  translateParts(message, false) ?? message;

/**
 * Fully translated message, or null when any part of it has no pattern.
 * Used by the coverage check; never throws.
 */
export const tryTranslateErrorMessage = (message: string): string | null => {
  try {
    return translateStrict(message);
  } catch {
    return null;
  }
};

/**
 * Translate an API error message. English (or an unknown language) and
 * messages without a pattern come back unchanged; several sentences are
 * translated one by one. Never throws.
 */
export const translateErrorMessage = (
  message: string,
  locale: ErrorLocale
): string => {
  if (locale !== "vi" || typeof message !== "string" || message === "") {
    return message;
  }
  try {
    return translateLenient(message);
  } catch {
    return message;
  }
};
