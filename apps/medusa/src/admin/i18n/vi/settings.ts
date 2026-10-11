/** Vietnamese for the Settings pages and the order invoice widget. */
const dictionary: Record<string, string> = {
  // Sidebar labels (static route config, kept for reference and QA)
  Payload: "Payload",
  Algolia: "Algolia",
  "Default Invoice Config": "Cấu hình hóa đơn mặc định",

  // Payload
  "Payload Settings": "Cài đặt Payload",
  "This page allows you to trigger syncing your Medusa data with Payload. It will only create items not in Payload.":
    "Trang này cho phép bạn kích hoạt đồng bộ dữ liệu Medusa sang Payload. Chỉ tạo các mục chưa có trong Payload.",
  "Sync Products to Payload": "Đồng bộ sản phẩm sang Payload",
  "Triggered syncing collection data with Payload":
    "Đã kích hoạt đồng bộ dữ liệu bộ sưu tập với Payload",
  "Failed to sync data with Payload": "Đồng bộ dữ liệu với Payload thất bại",

  // Algolia
  "Algolia Sync": "Đồng bộ Algolia",
  "Sync Data to Algolia": "Đồng bộ dữ liệu sang Algolia",
  "Successfully triggered data sync to Algolia":
    "Đã kích hoạt đồng bộ dữ liệu sang Algolia",
  "Failed to sync data to Algolia": "Đồng bộ dữ liệu sang Algolia thất bại",

  // Invoice config
  "Invoice Config": "Cấu hình hóa đơn",
  "Company Name": "Tên công ty",
  "Company Address": "Địa chỉ công ty",
  "Company Phone": "Số điện thoại công ty",
  "Company Email": "Email công ty",
  "Company Logo": "Logo công ty",
  Notes: "Ghi chú",
  "Invoice config updated successfully": "Đã cập nhật cấu hình hóa đơn",

  // Order invoice widget
  Invoice: "Hóa đơn",
  "Generate and download invoice for this order":
    "Tạo và tải hóa đơn của đơn hàng này",
  "Download Invoice": "Tải hóa đơn",
  "Invoice generated and downloaded successfully":
    "Đã tạo và tải hóa đơn thành công",
  "Failed to generate invoice: {error}": "Tạo hóa đơn thất bại: {error}",
};
export default dictionary;
