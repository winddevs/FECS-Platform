/** Procurement: suppliers, purchase orders, goods receipts. */
const dictionary: Record<string, string> = {
  // Page and tabs
  Procurement: "Mua hàng",
  "Suppliers, purchase orders and goods receipts.":
    "Nhà cung cấp, đơn mua hàng và phiếu nhập kho.",
  "Purchase orders": "Đơn mua hàng",
  Suppliers: "Nhà cung cấp",
  "New supplier": "Thêm nhà cung cấp",
  "Create supplier": "Tạo nhà cung cấp",
  "New purchase order": "Tạo đơn mua hàng",
  "Create purchase order": "Tạo đơn mua hàng",

  // Detail screen
  "purchase orders": "đơn mua hàng",
  "Purchase order {number}": "Đơn mua hàng {number}",
  Lines: "Dòng hàng",
  "Goods receipts": "Phiếu nhập kho",
  "No goods received yet.": "Chưa nhập kho lô hàng nào.",

  // Order actions
  Approve: "Duyệt",
  "Approve this purchase order? It can then be sent to the supplier.":
    "Duyệt đơn mua hàng này? Sau đó có thể gửi cho nhà cung cấp.",
  "Note (optional)": "Ghi chú (không bắt buộc)",
  "Send to supplier": "Gửi cho nhà cung cấp",
  "Mark this purchase order as sent to the supplier?":
    "Đánh dấu đơn mua hàng này đã gửi cho nhà cung cấp?",
  "Record goods receipt": "Ghi nhận phiếu nhập kho",
  "Record the goods that arrived. Use the QC_HOLD bucket for goods that must be inspected before use.":
    "Ghi nhận hàng đã về. Dùng nhóm QC_HOLD cho hàng cần kiểm tra trước khi sử dụng.",
  "Post receipt": "Ghi nhận phiếu nhập",
  Close: "Đóng",
  "Close this purchase order? No further goods can be received.":
    "Đóng đơn mua hàng này? Sau đó không thể nhập thêm hàng.",
  "Reason (optional)": "Lý do (không bắt buộc)",
  "Cancel order": "Hủy đơn",
  "Cancel this purchase order?": "Hủy đơn mua hàng này?",
  Reason: "Lý do",

  // Supplier columns and fields
  Code: "Mã",
  Name: "Tên",
  Status: "Trạng thái",
  Contact: "Liên hệ",
  Email: "Email",
  Phone: "Điện thoại",
  Currency: "Tiền tệ",
  "Lead time (days)": "Thời gian giao hàng (ngày)",
  "Contact name": "Tên người liên hệ",
  Address: "Địa chỉ",
  "Payment terms": "Điều khoản thanh toán",
  "Tax code": "Mã số thuế",
  "Currency (3 letters)": "Tiền tệ (3 ký tự)",

  // Purchase order columns and fields
  "PO number": "Số đơn mua hàng",
  Supplier: "Nhà cung cấp",
  "Supplier id": "Mã nhà cung cấp",
  Expected: "Dự kiến",
  Created: "Ngày tạo",
  "Created by": "Người tạo",
  "Approved by": "Người duyệt",
  Approved: "Ngày duyệt",
  Sent: "Ngày gửi",
  Closed: "Ngày đóng",
  Notes: "Ghi chú",
  "Expected delivery": "Ngày giao dự kiến",

  // Line columns and fields
  Material: "Nguyên phụ liệu",
  UoM: "ĐVT",
  Ordered: "Đã đặt",
  Received: "Đã nhập",
  "Over-receipt %": "Nhập vượt (%)",
  "Unit price": "Đơn giá",
  Line: "Dòng hàng",
  "Ordered quantity": "Số lượng đặt",
  "Over-receipt tolerance %": "Dung sai nhập vượt (%)",

  // Goods receipt columns and fields
  Receipt: "Phiếu nhập",
  Location: "Vị trí kho",
  "Delivery note": "Phiếu giao hàng",
  "Received by": "Người nhập",
  "Receiving location": "Vị trí kho nhận",
  "Receipt line": "Dòng phiếu nhập",
  "PO line": "Dòng đơn mua hàng",
  Quantity: "Số lượng",
  "Stock bucket": "Nhóm tồn kho",
  "QC_HOLD keeps the goods unavailable until QC releases them.":
    "QC_HOLD giữ hàng ở trạng thái không khả dụng cho đến khi QC giải phóng.",
  "Lot number": "Số lô",
  "Dye lot number": "Số lô nhuộm",
  Roll: "Cuộn vải",
  "Fabric only. Roll quantities must add up to the line quantity.":
    "Chỉ áp dụng cho vải. Tổng số lượng các cuộn phải bằng số lượng của dòng.",
  "Roll code": "Mã cuộn vải",
  "Roll quantity": "Số lượng cuộn",
  "Width (cm)": "Khổ vải (cm)",
  "#{line} {material} (ordered {ordered}, received {received})":
    "#{line} {material} (đã đặt {ordered}, đã nhập {received})",
};
export default dictionary;
