/** Vietnamese for the shared ERP kit (lib/erp). Keys are the English source text. */
const dictionary: Record<string, string> = {
  // Common actions
  Save: "Lưu",
  Cancel: "Hủy",
  Confirm: "Xác nhận",
  Create: "Tạo",
  Edit: "Sửa",
  Delete: "Xóa",
  Search: "Tìm kiếm",
  Filter: "Lọc",
  Reset: "Đặt lại",
  Apply: "Áp dụng",
  Submit: "Gửi",
  Close: "Đóng",
  Print: "In",
  Refresh: "Làm mới",
  Retry: "Thử lại",
  "Look up": "Tra cứu",
  "Run again": "Chạy lại",
  "Clear filters": "Xóa bộ lọc",
  Views: "Chế độ xem",
  Actions: "Thao tác",

  // Progress, results and generic states
  Loading: "Đang tải",
  "Loading {title}": "Đang tải {title}",
  "Loading label": "Đang tải nhãn",
  "Working...": "Đang xử lý...",
  Done: "Hoàn tất",
  "{label} done": "{label} hoàn tất",
  "No data": "Không có dữ liệu",
  "Nothing to show.": "Không có gì để hiển thị.",
  "No {title} found.": "Không tìm thấy {title}.",
  "No status": "Không có trạng thái",
  Yes: "Có",
  No: "Không",
  None: "Không có",
  Reason: "Lý do",

  // Pagination
  Previous: "Trước",
  Next: "Sau",
  "{title} pages": "Phân trang {title}",
  "of {total}": "trong {total}",
  "< Back to {label}": "< Quay lại {label}",

  // Filters and form inputs
  "{label}: all": "{label}: tất cả",
  Select: "Chọn",
  "Type a code or paste an id": "Nhập mã hoặc dán id",
  "Add {label}": "Thêm {label}",
  "Remove {label} {index}": "Xóa {label} {index}",

  // Form validation
  "{label} is required": "{label} là bắt buộc",
  "{label} must be a number": "{label} phải là số",
  "{label} must be a whole number": "{label} phải là số nguyên",
  "{label} must be valid JSON": "{label} phải là JSON hợp lệ",
  "{label} is not a valid date": "{label} không phải là ngày hợp lệ",
  "Add at least one {label} row": "Thêm ít nhất một dòng {label}",
  "{label}, row {row}: {message}": "{label}, dòng {row}: {message}",
  "{label}: {message}": "{label}: {message}",

  // Reconciliation and labels
  "Books are consistent.": "Sổ sách khớp nhau.",
  "Discrepancies were found. Details below.":
    "Phát hiện chênh lệch. Chi tiết bên dưới.",
  "Reconciliation findings": "Kết quả đối soát",
  "Label preview": "Xem trước nhãn",
  "The label could not be rendered.": "Không thể hiển thị nhãn.",

  // API errors
  "Permission denied": "Không đủ quyền",
  "Request failed": "Yêu cầu thất bại",
  "The request failed": "Yêu cầu thất bại",
  "Reference: {id}": "Mã tham chiếu: {id}",
  "You do not have permission to do this. Ask an administrator to grant the required role.":
    "Bạn không có quyền thực hiện thao tác này. Hãy nhờ quản trị viên cấp vai trò cần thiết.",
};
export default dictionary;
