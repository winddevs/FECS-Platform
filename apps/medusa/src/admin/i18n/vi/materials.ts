/** Raw materials: stock, receipts, counts, transfers, scan, master data. */
const dictionary: Record<string, string> = {
  // Page and tabs
  "Raw Materials": "Nguyên phụ liệu",
  "Raw material master data, stock, counts, transfers and reconciliation.":
    "Dữ liệu gốc nguyên phụ liệu, tồn kho, kiểm kê, chuyển kho và đối soát.",
  Stock: "Tồn kho",
  Receive: "Nhập kho",
  "Cycle counts": "Kiểm kê",
  Transfers: "Chuyển kho",
  Scan: "Quét mã",
  Materials: "Nguyên phụ liệu",
  Locations: "Vị trí kho",
  Reconciliation: "Đối soát",
  "Ledger vs balances vs reservations": "Sổ kho so với tồn kho và giữ chỗ",

  // Stock views
  Balances: "Tồn kho",
  Lots: "Lô",
  Rolls: "Cuộn vải",
  "Movements ledger": "Sổ biến động kho",
  Reservations: "Giữ chỗ",
  "Stock balances": "Tồn kho",
  "Click a balance to count, adjust, scrap, transfer or QC it.":
    "Chọn một dòng tồn kho để kiểm kê, điều chỉnh, hủy bỏ, chuyển kho hoặc xử lý QC.",
  "Immutable stock ledger, newest first.":
    "Sổ kho không thể sửa đổi, mới nhất ở trên.",
  "Recent receipts": "Phiếu nhập gần đây",
  "Receipt entries of the movements ledger.":
    "Các bút toán nhập kho trong sổ biến động kho.",
  "Movements of this balance": "Biến động của dòng tồn kho này",
  "Counts wait for a second person to approve the adjustment.":
    "Kết quả kiểm kê cần người thứ hai duyệt điều chỉnh.",

  // Actions
  "Print label": "In nhãn",
  "Roll label {code}": "Nhãn cuộn vải {code}",
  "Location label {code}": "Nhãn vị trí kho {code}",
  Issue: "Xuất kho",
  "Issue to production": "Xuất kho cho sản xuất",
  Release: "Giải phóng",
  "Reserve material": "Giữ chỗ nguyên phụ liệu",
  Reserve: "Giữ chỗ",
  "New material": "Thêm nguyên phụ liệu",
  "Create material": "Tạo nguyên phụ liệu",
  "New location": "Thêm vị trí kho",
  "Create location": "Tạo vị trí kho",
  "Receive stock": "Nhập kho",
  "Receive stock outside a purchase order (opening stock, returns from suppliers).":
    "Nhập kho ngoài đơn mua hàng (tồn đầu kỳ, hàng trả lại từ nhà cung cấp).",
  Approve: "Duyệt",
  Reject: "Từ chối",
  "Note (optional)": "Ghi chú (không bắt buộc)",
  Reason: "Lý do",
  "Approve this count? The difference is posted as a stock adjustment.":
    "Duyệt kết quả kiểm kê này? Chênh lệch sẽ được ghi nhận thành điều chỉnh tồn kho.",
  "Reject this count? No stock is changed.":
    "Từ chối kết quả kiểm kê này? Tồn kho không thay đổi.",
  Cancel: "Hủy",
  "Confirm the goods arrived at the destination?":
    "Xác nhận hàng đã đến nơi nhận?",
  "Cancel this transfer and return the stock to the source?":
    "Hủy lệnh chuyển kho này và trả hàng về kho nguồn?",
  "Same-site transfer": "Chuyển kho nội bộ",
  Transfer: "Chuyển kho",
  "Dispatch transfer": "Xuất chuyển kho",
  Dispatch: "Xuất chuyển",
  "Record count": "Ghi nhận kiểm kê",
  "Records the count. A second person must approve it before stock changes.":
    "Ghi nhận kết quả kiểm kê. Cần người thứ hai duyệt trước khi tồn kho thay đổi.",
  Adjust: "Điều chỉnh",
  "Post adjustment": "Ghi nhận điều chỉnh",
  "QC decision": "Quyết định QC",
  "Post decision": "Ghi nhận quyết định",
  "Transfer (same site)": "Chuyển kho (nội bộ)",
  "Dispatch (in transit)": "Xuất chuyển (đang vận chuyển)",
  Scrap: "Hủy bỏ",
  "Post scrap": "Ghi nhận hủy bỏ",

  // Detail and scan
  "Balance {id}": "Tồn kho {id}",
  balances: "tồn kho",
  "Roll {code}": "Cuộn vải {code}",
  "Location {code}": "Vị trí kho {code}",
  "Stock of this roll": "Tồn kho của cuộn vải này",
  "Stock at this location": "Tồn kho tại vị trí này",
  "Roll balances": "Tồn kho cuộn vải",
  "Location balances": "Tồn kho theo vị trí",
  "Scan or type a roll / location code":
    "Quét hoặc nhập mã cuộn vải / vị trí kho",
  "e.g. ROLL-0001": "ví dụ: ROLL-0001",

  // Common columns and filters
  Code: "Mã",
  Name: "Tên",
  Type: "Loại",
  Status: "Trạng thái",
  Material: "Nguyên phụ liệu",
  Location: "Vị trí kho",
  Warehouse: "Kho",
  Kind: "Loại vị trí",
  Country: "Quốc gia",
  Active: "Đang dùng",
  Version: "Phiên bản",
  Source: "Nguồn",
  Notes: "Ghi chú",
  Quantity: "Số lượng",
  Qty: "SL",
  Lot: "Lô",
  Roll: "Cuộn vải",
  "Dye lot": "Lô nhuộm",
  "Dye lots": "Lô nhuộm",
  Supplier: "Nhà cung cấp",
  UoM: "ĐVT",
  Allocation: "Phân bổ",
  "Material id": "Mã nguyên phụ liệu",
  "Balance id": "Mã tồn kho",
  "Lot id": "Mã lô",
  "Roll id": "Mã cuộn vải",
  "Location id": "Mã vị trí kho",
  "To location id": "Mã vị trí kho đến",
  "Source id": "Mã nguồn",
  "Lot no": "Số lô",
  "Dye lot no": "Số lô nhuộm",
  "Source type": "Loại nguồn",
  "Roll code": "Mã cuộn vải",
  "Reference type": "Loại chứng từ",
  "Reference id": "Mã chứng từ",
  "Ref type": "Loại chứng từ",
  "Ref id": "Mã chứng từ",

  // Balance columns
  "On hand": "Tồn thực tế",
  Reserved: "Đã giữ chỗ",
  "QC hold": "Giữ chờ QC",
  Damaged: "Hư hỏng",
  Available: "Khả dụng",

  // Reservation columns
  Reservation: "Giữ chỗ",
  Requested: "Đã yêu cầu",
  Issued: "Đã xuất",
  Released: "Đã giải phóng",
  "Planner OK": "KH duyệt",

  // Cycle count columns
  Counted: "Đã kiểm",
  Expected: "Dự kiến",
  Difference: "Chênh lệch",
  "Counted by": "Người kiểm",
  "Decided by": "Người quyết định",
  "Decision note": "Ghi chú quyết định",

  // Transfer columns
  From: "Từ",
  Via: "Qua",
  To: "Đến",
  Dispatched: "Đã xuất chuyển",
  Closed: "Đã đóng",

  // Roll, lot, movement columns
  "Initial qty": "SL ban đầu",
  "Width (cm)": "Khổ vải (cm)",
  Received: "Đã nhập",
  When: "Thời điểm",
  "On hand Δ": "Tồn thực tế Δ",
  "QC hold Δ": "Giữ chờ QC Δ",
  "Damaged Δ": "Hư hỏng Δ",
  Actor: "Người thực hiện",

  // Material form
  "Unit of measure": "Đơn vị tính",
  "Track lots": "Theo dõi theo lô",
  "Track rolls": "Theo dõi theo cuộn",
  "Track dye lots": "Theo dõi theo lô nhuộm",
  "Max dye lots per order": "Số lô nhuộm tối đa mỗi đơn",
  "Allocation policy": "Quy tắc phân bổ",
  "Reduce roll fragments": "Giảm cuộn lẻ",

  // Location form
  "Warehouse code": "Mã kho",

  // Receive form
  "Lot number": "Số lô",
  "Dye lot number": "Số lô nhuộm",
  "Roll-tracked fabric: one row per roll. Leave empty and use Quantity for other materials.":
    "Vải theo dõi theo cuộn: mỗi cuộn một dòng. Để trống và dùng Số lượng cho nguyên phụ liệu khác.",
  "Roll quantity": "Số lượng cuộn",
  "Quantity (no rolls)": "Số lượng (không theo cuộn)",
  "Stock bucket": "Nhóm tồn kho",

  // Reserve, issue, release forms
  "Reference line": "Dòng chứng từ",
  "Planner approves a dye-lot override": "Kế hoạch duyệt ngoại lệ lô nhuộm",
  "Needs the manufacturing:approve permission.":
    "Cần quyền manufacturing:approve.",
  "Reservation id": "Mã giữ chỗ",
  "Quantity (empty = all remaining)":
    "Số lượng (để trống = toàn bộ phần còn lại)",

  // Count, adjust, scrap, QC, transfer forms
  "Open Stock > Balances and click a row to prefill this.":
    "Mở Tồn kho > Tồn kho rồi chọn một dòng để điền sẵn.",
  "Counted quantity": "Số lượng kiểm",
  "Balance version seen": "Phiên bản tồn kho đã thấy",
  "The count is rejected if the balance changed since this version.":
    "Kết quả kiểm kê bị từ chối nếu tồn kho đã thay đổi kể từ phiên bản này.",
  Direction: "Hướng điều chỉnh",
  "Scrap from bucket": "Hủy bỏ từ nhóm",
  "Business reference type": "Loại chứng từ nghiệp vụ",
  "Business reference id": "Mã chứng từ nghiệp vụ",
  Decision: "Quyết định",
  "To location": "Vị trí kho đến",
  "Transit location": "Vị trí kho trung chuyển",
  "Must be an IN_TRANSIT location. Optional when exactly one exists.":
    "Phải là vị trí kho IN_TRANSIT. Không bắt buộc nếu chỉ có một vị trí.",
};
export default dictionary;
