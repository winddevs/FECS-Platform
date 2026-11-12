# Hướng dẫn sử dụng hệ thống bibaestudios

Tài liệu này dành cho người vận hành: nhập sản phẩm và giá ở **Medusa Admin**
(`https://ecom.bibaestudios.com`), soạn nội dung ở **Payload CMS**
(`https://bibaestudios.com/admin`), để cửa hàng hiển thị đúng ở
**`https://bibaestudios.com/vi/vn`** (tiếng Việt, thị trường Việt Nam, đồng VND).

Nội dung được viết từ source code, không phải từ việc thao tác trên máy chủ thật.
Những chỗ code không đủ để khẳng định được đánh dấu **[Cần kiểm tra]**; mục 9 gom
chúng lại thành danh sách kiểm tra sau khi triển khai.

---

## 1. Tổng quan: ba cổng, một cửa hàng

| Cổng         | Địa chỉ                                                | Dùng để                                                                                           | Chạy trên       |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------- |
| Medusa Admin | `https://ecom.bibaestudios.com` (tự chuyển tới `/app`) | Sản phẩm, giá, tồn kho, đơn hàng, khách hàng, vùng bán hàng, vận chuyển, thanh toán, vận hành ERP | máy chủ backend |
| Payload CMS  | `https://bibaestudios.com/admin`                       | Trang nội dung, bài viết, menu đầu trang, thư viện ảnh/video, bản sao nội dung sản phẩm           | máy chủ store   |
| Cửa hàng     | `https://bibaestudios.com/vi/vn`                       | Khách mua hàng                                                                                    | máy chủ store   |

`https://admin.bibaestudios.com` chỉ chuyển hướng sang `https://bibaestudios.com/admin`.
Hãy đăng nhập ở `bibaestudios.com/admin`, vì cookie đăng nhập của Payload gắn với tên miền đó.

### Địa chỉ cửa hàng `/vi/vn`

`/{ngôn ngữ}/{quốc gia}/...`

- `vi` là tiếng Việt (mặc định). `en` là tiếng Anh. Cửa hàng chỉ phục vụ hai ngôn ngữ này.
- `vn` là mã quốc gia. Nó chỉ hoạt động khi Medusa có một **Region** chứa Vietnam. Region này nên dùng tiền tệ VND.
- Vào `bibaestudios.com` hoặc đường dẫn thiếu mã quốc gia, hệ thống tự chuyển tới `/vi/vn/...`.

### Dữ liệu nào nằm ở đâu

```
Medusa Admin  ──(tự đồng bộ vài giây sau khi lưu)──►  Payload "Sản phẩm" (bản sao)
     │                                                       │
     │  giá, tồn kho, biến thể, danh mục, bộ sưu tập          │  tên/mô tả/ảnh hiển thị
     └───────────────────────────┐          ┌────────────────┘
                                 ▼          ▼
                          Cửa hàng /vi/vn  ◄──  Payload: Trang, Bài viết, Menu đầu trang, Media
```

| Nội dung trên cửa hàng                                                                                              | Sửa ở đâu                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Tên, mô tả, ảnh, thông tin sản phẩm                                                                                 | **Medusa Admin** (khuyến nghị, xem 4.5)                                  |
| Giá, giảm giá, tồn kho, biến thể (size, màu)                                                                        | **Medusa Admin**                                                         |
| Danh mục, bộ sưu tập, tên và ảnh ô danh mục trên trang chủ                                                          | **Medusa Admin**                                                         |
| Phí và phương thức vận chuyển, phương thức thanh toán                                                               | **Medusa Admin**                                                         |
| Menu đầu trang (các mục tuỳ chỉnh và mega menu)                                                                     | **Payload** > Đầu trang                                                  |
| Trang nội dung như "Giới thiệu", "Chính sách" (`/vi/vn/<slug>`)                                                     | **Payload** > Trang                                                      |
| Blog (`/vi/vn/posts`)                                                                                               | **Payload** > Bài viết                                                   |
| Ảnh và video dùng trong Payload                                                                                     | **Payload** > Hình ảnh & video                                           |
| Chữ cố định: banner trang chủ, thanh thông báo, chân trang, đoạn "Giao hàng & đổi trả" trên trang sản phẩm, tên nút | **Trong source code**, cần lập trình viên sửa rồi triển khai lại (mục 7) |

**Trang chủ không đọc từ Payload.** Trang chủ `/vi/vn` ghép từ chữ cố định trong code và
dữ liệu Medusa (8 sản phẩm mới nhất, 2 bộ sưu tập đầu tiên, 4 danh mục cấp cao đầu tiên). Một trang Payload
có slug `home` không làm thay đổi trang chủ này.

---

## 2. Đăng nhập và phân quyền

### 2.1 Medusa Admin: phải có "vai trò" mới vào được

Mọi màn hình trong Medusa Admin kiểm tra vai trò lưu ở `metadata.fashion_roles` của tài khoản.
**Tài khoản không có vai trò nào sẽ bị lỗi 403 ở mọi màn hình**, kể cả Đơn hàng và Sản phẩm.

Vai trò cho người làm bán hàng:

| Vai trò                                  | Dùng cho               | Làm được                                                                                   |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `ERP_ADMIN` (Quản trị ERP)               | Chủ hệ thống           | Tất cả, kể cả vùng bán hàng, khoá API, phân quyền nhân viên                                |
| `COMMERCE_ADMIN` (Quản lý bán hàng)      | Người quản lý cửa hàng | Sản phẩm, giá, khuyến mãi, đơn hàng, khách hàng, vùng bán hàng, vận chuyển, thuế, kênh bán |
| `CUSTOMER_SUPPORT` (Chăm sóc khách hàng) | CSKH                   | Đơn hàng, đổi trả, giao hàng, hội thoại mạng xã hội, khách hàng. Không sửa sản phẩm        |
| `FINANCE` (Kế toán)                      | Kế toán                | Thanh toán, hoàn tiền, báo cáo                                                             |
| `AUDITOR` (Kiểm toán, chỉ xem)           | Kiểm tra               | Chỉ đọc                                                                                    |

Còn 10 vai trò kho và sản xuất (mua hàng, thủ kho, kế hoạch sản xuất, thợ cắt, thợ may, QC, đóng gói, SRE...).
Bảng đầy đủ nằm trong [backoffice.md](backoffice.md).

**Cấp vai trò:** đăng nhập bằng `ERP_ADMIN`, vào **Vận hành > Phân quyền nhân viên**
(Operations > Staff access), chọn nhân viên, **Edit roles**, **Save roles**. Hệ thống không cho gỡ `ERP_ADMIN` cuối cùng.
Dòng lệnh thay thế: `pnpm --filter medusa grant-role <email> <ROLE...>`.

**Thêm nhân viên mới:** Settings > Users (Invite). Email mời cần SMTP đã cấu hình. Sau khi người đó nhận lời mời,
cấp vai trò như trên. Giao diện mời không có ô chọn vai trò.

Lần đầu mở trang đăng nhập, giao diện tự chuyển sang tiếng Việt một lần. Sau đó bạn đổi ngôn ngữ ở Profile > Language.

### 2.2 Payload CMS

- Chỉ tài khoản có vai trò `admin` mới vào được `/admin`. Vai trò `public` ("Khách hàng") không vào được.
- Mọi người dùng CMS đều là quản trị đầy đủ: không có vai trò "biên tập viên" hạn chế.
- Tài khoản đầu tiên tạo bằng `scripts/deploy.sh seed-cms <email>`. Tài khoản tiếp theo: **Users > Create New**, chọn vai trò `admin`.
- Giao diện admin mặc định tiếng Việt. Đổi ở Account > Language.
- **Mật khẩu:** đổi ngay sau lần đăng nhập đầu. Không gửi mật khẩu qua chat hay ticket.

---

## 3. Thiết lập một lần cho thị trường Việt Nam (Medusa Admin)

Làm khi dựng hệ thống mới hoặc khi `/vi/vn` báo trống/404. Với hệ thống đã triển khai, hãy kiểm tra từng mục.
Các script seed đã tạo sẵn một phần (xem cột "Seed").

| #   | Việc                                                               | Ở đâu trong Medusa Admin                                                 | Seed                                                                            |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | Thêm tiền tệ **VND** vào cửa hàng                                  | Settings > Store > Currencies                                            | `seed-vietnam.py` thêm VND (không đặt mặc định)                                 |
| 2   | Tạo **Region "Vietnam"**: tiền tệ VND, quốc gia Vietnam            | Settings > Regions                                                       | `seed-vietnam.py`                                                               |
| 3   | Gắn **phương thức thanh toán** cho Region                          | Settings > Regions > Vietnam > Payment providers                         | Seed chỉ gắn `pp_system_default` (thanh toán thủ công/COD)                      |
| 4   | Tạo **kho** và vùng giao hàng Việt Nam                             | Settings > Locations & Shipping                                          | `seed-vietnam.py`                                                               |
| 5   | Tạo **phương thức vận chuyển** (phí cố định VND)                   | Settings > Locations & Shipping > vùng Vietnam                           | "Giao hàng tiêu chuẩn" 30.000 ₫ và "Giao hàng nhanh" 60.000 ₫                   |
| 6   | Cấu hình **thuế** cho Việt Nam                                     | Settings > Tax Regions                                                   | Seed chỉ tạo vùng thuế `vn` với nhà cung cấp mặc định, **chưa có mức thuế nào** |
| 7   | **Kênh bán** gắn với kho và khoá API                               | Settings > Sales Channels                                                | Có                                                                              |
| 8   | **Publishable API Key** gắn với kênh bán, đưa vào `.env` của store | Settings > Publishable API Keys, rồi `scripts/deploy.sh publishable-key` | Có                                                                              |
| 9   | Tạo ít nhất **một bộ sưu tập** (Collection)                        | Products > Collections                                                   | Không. Build của store cần có                                                   |

Lưu ý quan trọng:

- **Giá VND nhập theo đồng, không nhân 100.** Ví dụ áo giá 250.000 ₫ thì nhập `250000`. Cửa hàng hiển thị `250.000 ₫`.
- **Giá mẫu từ `seed-vietnam.py` chỉ là giá tạm** (quy đổi từ EUR, 27.000 ₫ mỗi EUR, làm tròn nghìn). Hãy sửa lại.
- **Payment provider.** Danh sách trong Region quyết định khách thấy phương thức nào ở bước thanh toán.
  - `pp_system_default`: thanh toán thủ công, dùng làm COD.
  - `pp_payos_payos` (chuyển khoản QR payOS, chỉ VND): chỉ xuất hiện trong danh sách khi backend có đủ `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `STOREFRONT_URL`. Seed **không** tự gắn nó vào Region. Bạn phải thêm tay.
  - Stripe (`pp_stripe_stripe`) và PayPal chỉ có khi cấu hình khoá tương ứng.
- **Thuế.** Chưa có mức thuế nào. Thêm mức VAT trong Settings > Tax Regions > Vietnam. Muốn giá hiển thị đã gồm thuế, bật tuỳ chọn tax-inclusive của Region/bảng giá, rồi kiểm tra giỏ hàng. **[Cần kiểm tra]** cách hiển thị thuế ở giỏ hàng (code phần tổng giỏ hàng chưa được đọc).
- **Sau khi thêm Region mới**, bản đồ vùng trong store được làm mới mỗi giờ. Nếu `/vi/vn` vẫn lỗi sau khi thêm, nhờ kỹ thuật khởi động lại hoặc triển khai lại store.
- **Nếu store không lấy được Region nào**, `/vi/vn` vẫn mở nhưng thiếu khu sản phẩm và trang sản phẩm trả 404.

---

## 4. Quản lý sản phẩm (Medusa Admin)

### 4.1 Quy trình tạo sản phẩm để hiển thị tốt trên `/vi/vn`

Làm theo thứ tự này. Bỏ sót bước nào thì sản phẩm thường **không hiện hoặc không mua được**.

1. **Products > Create.** Điền các trường ở bảng 4.2.
2. **Status = Published.** Bản nháp không hiện trên cửa hàng và không vào tìm kiếm.
3. **Sales channel:** chọn kênh bán đang gắn với Publishable API Key của cửa hàng (mặc định "Webshop" hoặc "Default Sales Channel"). Sản phẩm không thuộc kênh này sẽ không xuất hiện.
4. **Options và Variants.** Đặt tên option bằng tiếng Việt ngay từ đầu, ví dụ "Kích cỡ", "Màu sắc". Medusa không có bản dịch, tên bạn nhập là tên khách thấy ở cả `/vi` và `/en`.
5. **Giá cho từng variant bằng VND** (hoặc theo Region Vietnam). Variant thiếu giá VND sẽ không có giá để hiển thị và bán. **[Cần kiểm tra]** hành vi chính xác trên cửa hàng.
6. **Tồn kho (Inventory).** Xem 4.4.
7. **Ảnh.** Xem 4.3.
8. **Danh mục và bộ sưu tập.** Xem 4.6.
9. **Lưu, rồi kiểm tra:**
   - Mở `https://bibaestudios.com/vi/vn/products/<handle>`.
   - Mở `https://bibaestudios.com/vi/vn/store` xem thẻ sản phẩm.
   - Gõ tên sản phẩm vào ô tìm kiếm trên đầu trang.
   - Trong Payload > **Sản phẩm**, phải xuất hiện một bản ghi cùng tên (bước đồng bộ tự động).

### 4.2 Trường nào hiển thị ở đâu

| Trường (Medusa)                                             | Hiển thị trên cửa hàng                                                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title                                                       | Tên sản phẩm (trang sản phẩm, thẻ, breadcrumb, tiêu đề tab trình duyệt kèm "\| bibaestudios")                                                                  |
| Handle                                                      | Phần cuối của URL: `/vi/vn/products/<handle>`. Dùng chữ không dấu, viết thường, nối bằng dấu gạch ngang. **Đổi handle sẽ đổi URL** và làm hỏng các liên kết cũ |
| Description                                                 | Mô tả trên trang sản phẩm. Xuống dòng được giữ nguyên. Cũng dùng làm meta description (cắt còn khoảng 160 ký tự)                                               |
| Subtitle                                                    | Chưa hiển thị trên trang sản phẩm                                                                                                                              |
| Thumbnail                                                   | Ảnh thẻ sản phẩm và ảnh chia sẻ mạng xã hội (og:image)                                                                                                         |
| Images                                                      | Bộ ảnh trang sản phẩm                                                                                                                                          |
| Collection                                                  | Hiện ở breadcrumb và phía trên tên sản phẩm. Quyết định tab "bộ sưu tập" trên trang chủ                                                                        |
| Categories                                                  | Mega menu "Danh mục", chân trang, trang `/categories/<handle>`                                                                                                 |
| Tags                                                        | Dùng cho bộ lọc và tìm kiếm                                                                                                                                    |
| Material, Origin country, Type, Weight, Length/Width/Height | Mục **Thông tin sản phẩm** (mở rộng). Trường trống hiện dấu "-"                                                                                                |
| Variants + Options                                          | Nút chọn kích cỡ/màu, giá, nút mua                                                                                                                             |
| Metadata                                                    | Không hiển thị. Một số khoá có tác dụng với sản xuất (4.8)                                                                                                     |

Mục **Giao hàng & đổi trả** trên trang sản phẩm là chữ cố định cho mọi sản phẩm, không sửa theo từng sản phẩm được.

Cách hiển thị biến thể:

- Khối chọn option chỉ hiện khi sản phẩm có **từ 2 variant trở lên**. Sản phẩm 1 variant được chọn sẵn.
- Giá ban đầu hiển thị dạng "từ {giá thấp nhất}", sau khi chọn variant thì hiện giá variant đó.
- Option là **nút chữ**, không có ô màu. Màu hiện bằng chữ, ví dụ "Đen". Tổ hợp không tồn tại chỉ làm nút mua bị tắt, không làm mờ lựa chọn.
- Giá giảm (bảng giá loại _sale_) hiện giá cũ gạch ngang và nhãn "-X%".

### 4.3 Ảnh sản phẩm

- **Tỉ lệ khung hình trên cửa hàng là 3:4 (dọc)** cho thẻ sản phẩm, ảnh lớn và ảnh nhỏ. Hãy chụp/cắt ảnh dọc, khuyến nghị **1200×1600 px trở lên**, chủ thể ở giữa (khung dùng chế độ lấp đầy, ảnh khác tỉ lệ sẽ bị cắt mép).
- Định dạng JPG/PNG/WebP đều được. Hệ thống tự tạo bản WebP nhỏ hơn theo kích thước màn hình.
- **Thumbnail** nên là ảnh đẹp nhất, vì nó dùng cho thẻ sản phẩm và khi chia sẻ link lên mạng xã hội. Facebook hiển thị ảnh ngang 1200×630, nên giữ chủ thể ở giữa để không bị cắt mất.
- Ảnh đầu tiên khác thumbnail được dùng làm ảnh khi rê chuột lên thẻ sản phẩm.
- **Thứ tự lấy ảnh cho bộ ảnh trang sản phẩm:** nếu bản ghi Payload của sản phẩm có ảnh thì dùng ảnh Payload, ngược lại dùng ảnh Medusa. Hai nguồn không được trộn.
- Khi bạn lưu sản phẩm ở Medusa, hệ thống tải ảnh Medusa lên Payload (thư viện Media). Đó là cách ảnh đi từ Medusa sang cửa hàng.

### 4.4 Tồn kho

Một variant được coi là còn hàng khi **ít nhất một** điều kiện đúng:

- Tắt **Manage inventory** (luôn bán được, dùng cho hàng may theo đơn), hoặc
- Bật **Allow backorder**, hoặc
- Số lượng tồn tại kho (`inventory_quantity`) lớn hơn 0.

Còn lại, nút mua đổi thành "Hết hàng". Cửa hàng không hiển thị số lượng tồn hay cảnh báo "sắp hết".

Để số lượng tồn có giá trị, kho (Stock location) phải được liên kết với Sales Channel của cửa hàng, và mỗi
inventory item phải có số lượng ở kho đó. Vào **Inventory**, mở mục của SKU, thêm/sửa số lượng ở kho.
Vai trò cần: `COMMERCE_ADMIN` đọc, sửa tồn cần `fg:adjust` (có ở `ERP_ADMIN`, `WAREHOUSE_MANAGER`).

Hàng sản xuất sẵn (MTS) có thể cập nhật tồn từ kho thành phẩm của ERP, nhưng chỉ khi backend bật
`FG_SYNC_TO_MEDUSA_ENABLED=true`. Nếu cờ này tắt (mặc định), hãy nhập tồn trực tiếp ở Inventory.

### 4.5 Sửa nội dung sản phẩm: nên sửa ở Medusa hay Payload?

**Khuyến nghị: sửa tên, mô tả và ảnh ở Medusa Admin.**

Lý do (theo code):

- Mỗi lần lưu sản phẩm ở Medusa, tên, phụ đề, mô tả, thumbnail và ảnh được **ghi đè sang Payload**.
- Sửa **tên, phụ đề, mô tả** trong Payload sẽ được đẩy ngược về Medusa. Nhưng lần lưu Medusa kế tiếp lại ghi đè Payload bằng giá trị Medusa.
- Ảnh sửa trong Payload **dễ bị ghi đè** vào lần lưu sản phẩm ở Medusa kế tiếp.
- Mô tả sửa trong Payload là rich text. Cách Medusa lưu nó khi đẩy ngược **[Cần kiểm tra]**.
- Lỗi đẩy ngược từ Payload sang Medusa chỉ ghi vào log, **người sửa không thấy báo lỗi**.

Cửa hàng ưu tiên tên và mô tả từ Payload nếu có, nếu không dùng của Medusa. Vì hai nơi được đồng bộ, hãy chọn **một nơi duy nhất để sửa** (Medusa).

Các trường chỉ có ở Payload: nhóm **SEO** của sản phẩm (`meta_title`, `meta_description`, `meta_keywords`) và nhãn option. **Cửa hàng hiện không đọc nhóm SEO này**, nên điền vào cũng chưa có tác dụng. Tiêu đề trang dùng tên sản phẩm, mô tả trang lấy từ mô tả sản phẩm.

Bản ghi sản phẩm trong Payload **không tạo hay xoá tay được**: nó tự tạo khi bạn tạo sản phẩm ở Medusa.
Số lượng variant/option và ID không sửa được ở Payload.

### 4.6 Danh mục (Categories) và bộ sưu tập (Collections)

- **Danh mục** ở Products > Categories. Chỉ cần tạo ở Medusa, không cần tạo ở Payload.
  - Mega menu "Danh mục" ở đầu trang tự lấy danh mục cấp cao cùng danh mục con.
  - Chân trang liệt kê tối đa 6 danh mục cấp cao.
  - Trang chủ có 4 ô danh mục (4 danh mục cấp cao đầu tiên). **Ảnh ô lấy từ sản phẩm đầu tiên của danh mục**; danh mục không có sản phẩm thì ô không có ảnh.
  - Handle của danh mục là URL: `/vi/vn/categories/<handle>`.
- **Bộ sưu tập** ở Products > Collections.
  - Chân trang liệt kê tối đa 6 bộ sưu tập.
  - Trang chủ hiện 2 bộ sưu tập đầu tiên có sản phẩm (mỗi bộ 8 sản phẩm) thành các tab.
  - URL: `/vi/vn/collections/<handle>`.
- Tên danh mục và bộ sưu tập chỉ có một ngôn ngữ. Hãy đặt tên tiếng Việt (hoặc tên chung dùng được ở cả hai trang `/vi` và `/en`).
- **Thay đổi ở danh mục và bộ sưu tập có thể không hiện ngay.** Xem mục 6.

### 4.7 Giá, khuyến mãi, mã giảm giá

- Giá gốc: ở từng Variant (tab Prices), nhập VND.
- Giá khuyến mãi theo thời gian: **Price Lists** (loại _Sale_).
- Mã giảm giá và chương trình: **Promotions**, **Campaigns**. Cần vai trò có `pricing:manage` (`ERP_ADMIN`, `COMMERCE_ADMIN`).

### 4.8 Hàng may theo đơn và hàng sản xuất sẵn (metadata)

Chỉ cần khi dùng phần ERP sản xuất. Đặt trong **Metadata** của sản phẩm hoặc variant (metadata ở variant ưu tiên hơn):

| Khoá               | Giá trị          | Ý nghĩa                                                                                             |
| ------------------ | ---------------- | --------------------------------------------------------------------------------------------------- |
| `fulfillment_mode` | `MTS` hoặc `MTO` | MTS: sản xuất sẵn theo kế hoạch, bán từ tồn kho. MTO: may theo đơn, tạo yêu cầu sản xuất khi có đơn |
| `style_sku`        | ví dụ `TEE-BLK`  | Tên mẫu để tra BOM và quy trình sản xuất. Bắt buộc với MTO                                          |
| `payload_id`       | tự sinh          | **Không sửa.** Hệ thống ghi sau khi đồng bộ sang Payload                                            |

Với MTO: tắt **Manage inventory** ở variant và có SKU. Hai cờ `MTO_ENABLED` và `MANUFACTURING_ENABLED` phải bật ở backend thì đơn MTO mới sinh yêu cầu sản xuất.

### 4.9 Đơn hàng, giao hàng, đổi trả

- **Orders:** xem đơn, hoàn tất thanh toán, tạo giao hàng (fulfillment), huỷ. Vai trò sửa đơn: `ERP_ADMIN`, `COMMERCE_ADMIN`, `CUSTOMER_SUPPORT`. Thu và hoàn tiền: `ERP_ADMIN`, `FINANCE`.
- Trang đơn có khối **Invoice** > **Download Invoice** (Tải hóa đơn) xuất PDF. Thông tin công ty trên hóa đơn đặt ở **Settings > Default Invoice Config** (tên, địa chỉ, điện thoại, email, ghi chú, logo).
- Email xác nhận đơn kèm hóa đơn PDF được gửi tự động khi khách đặt hàng, nếu SMTP đã cấu hình.
- Đổi trả: mục **Returns (Trả hàng)** trong thanh bên: cấp phép, nhận hàng, kiểm tra, hoàn tiền. Mặc định cho đổi trả trong 14 ngày sau giao (chỉnh ở Operations > Settings, khoá `returns.window_days`).
- Hội thoại Messenger cần người xử lý: **Social Support (Hỗ trợ mạng xã hội)**.

### 4.10 Các nút đồng bộ trong Settings

| Mục                        | Nút                                                         | Khi nào dùng                                                                                            |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Settings > **Payload**     | Sync Products to Payload (Đồng bộ sản phẩm sang Payload)    | Sản phẩm đã có trong Medusa nhưng chưa có bản ghi Payload. Nó **chỉ tạo mới**, không cập nhật cái đã có |
| Settings > **Meilisearch** | Sync Data to Meilisearch (Đồng bộ dữ liệu sang Meilisearch) | Làm mới toàn bộ chỉ mục tìm kiếm, ví dụ sau khi nhập hàng loạt hoặc đổi tên danh mục                    |

### 4.11 Các mục ERP trong thanh bên

Mười một mục: Mua hàng, Nguyên phụ liệu, Kế hoạch, Sản xuất, Xưởng, Chất lượng, Thành phẩm, Giao hàng, Trả hàng,
Hỗ trợ mạng xã hội, Vận hành. Hướng dẫn chi tiết từng màn hình và quyền nằm ở [backoffice.md](backoffice.md).
Nếu một nút báo "Permission denied / Missing permission: ...", tài khoản thiếu vai trò tương ứng, hãy nhờ `ERP_ADMIN` cấp.

Khi có lỗi, thông báo kèm `Reference: cor_...`. Gửi mã này cho kỹ thuật để tra log.

---

## 5. Quản lý nội dung (Payload CMS tại `/admin`)

### 5.1 Các mục trong thanh bên

| Mục                                             | Dùng cho                           | Ghi chú                                             |
| ----------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| **Trang** (Pages)                               | Trang nội dung tại `/vi/vn/<slug>` | Có bản nháp, xem trước, hẹn giờ xuất bản            |
| **Bài viết** (Posts)                            | Blog tại `/vi/vn/posts`            | Có bản nháp                                         |
| **Danh mục** (Categories)                       | Phân loại **bài viết**             | Không liên quan danh mục sản phẩm                   |
| **Hình ảnh & video** (Media)                    | Thư viện ảnh, video                | Tối đa 100 MB mỗi tệp                               |
| **Sản phẩm**                                    | Bản sao sản phẩm Medusa            | Xem 4.5. Không tạo/xoá được                         |
| **Chuyển hướng** (Redirects)                    | Chuyển URL cũ sang URL mới         | Cần build lại site để có hiệu lực                   |
| **Biểu mẫu**, **Biểu mẫu đã gửi**               | Form liên hệ                       | Xem 5.6                                             |
| **Kết quả tìm kiếm**                            | Chỉ mục bài viết, tự cập nhật      | Chỉ đọc                                             |
| **Người dùng**                                  | Tài khoản CMS                      |                                                     |
| **Đầu trang** (Header), **Chân trang** (Footer) | Menu                               | Chân trang Payload chưa được cửa hàng dùng, xem 5.5 |

Trong thanh bên còn vài mục lạ (`video`, `br`, `commandLine`, `command`, `link`, `templateCards`, "Nội dung dùng lại"). Chúng là mục thừa, **không ảnh hưởng cửa hàng, bỏ qua**.

### 5.2 Ngôn ngữ nội dung

- Góc trên có bộ chọn ngôn ngữ nội dung: Tiếng Việt, English, French, Arabic. Cửa hàng chỉ phục vụ **Tiếng Việt và English**; hai ngôn ngữ còn lại bỏ qua.
- Nhập nội dung tiếng Việt khi bộ chọn đang là **Tiếng Việt**. Trường nào chưa có bản tiếng Việt sẽ hiển thị bản tiếng Anh, nên cửa hàng không bị trống.
- Khối nội dung (layout) của Trang, tiêu đề và nội dung Bài viết, menu đầu trang, SEO đều theo từng ngôn ngữ. **Slug và ảnh đại diện bài viết dùng chung.**
- Tên admin tiếng Việt chỉ có cho phần đã được dịch. Một số nhãn như Hero, Slug, Meta, Alt Text vẫn là tiếng Anh. Đó là bình thường.

### 5.3 Tạo một Trang (ví dụ "Chính sách đổi trả")

1. **Trang > Tạo mới.** Nhập **Title**. Slug tự sinh từ tiêu đề và đang khoá. Mở khoá để sửa nếu muốn slug không dấu, ngắn gọn (ví dụ `chinh-sach-doi-tra`).
2. Tab **Hero**: chọn **Type**.
   - `none`: không có hero.
   - `flickeringImpact` (mặc định), `highImpact`, `mediumImpact`, `lowImpact`.
   - `highImpact` và `mediumImpact` **bắt buộc có ảnh/video**.
   - Điền rich text và tối đa 2 liên kết. **[Cần kiểm tra]** giao diện thực của từng kiểu hero (code các hero chưa được đọc).
3. Tab **Content**: thêm các khối (Layout). Khối dùng được:

| Khối             | Dùng để                                                       |
| ---------------- | ------------------------------------------------------------- |
| Call to Action   | Câu kêu gọi và tối đa 2 nút                                   |
| Content          | Cột chữ (1/3, 1/2, 2/3 hoặc toàn chiều rộng), có thể kèm link |
| Media Block      | Một ảnh hoặc video                                            |
| Logo Grid        | Lưới logo, ví dụ đối tác                                      |
| Hover Cards      | 1 đến 8 thẻ có ảnh, mô tả, link                               |
| Hover Highlights | Dòng chữ nổi bật khi rê chuột, kèm ảnh                        |
| Content Grid     | Lưới 1 đến 8 ô nội dung                                       |
| Card Grid        | Thẻ chữ có link                                               |
| Callout          | Lời trích có logo, tên, chức danh                             |
| Archive          | Danh sách bài viết, theo tất cả hoặc chọn tay                 |

Tránh dùng hai khối này, vì code hiện chưa dùng được chúng:

- **Form Block**: khối không có ô chọn biểu mẫu nên không gắn được form nào.
- **Media Accordion Block**: không có mã hiển thị tương ứng, nên rất có thể không ra gì trên cửa hàng.

4. Tab **SEO**: điền **Meta title**, **Meta description**, **Meta image**. Có nút tạo tự động tiêu đề.
   - Tiêu đề trang hiển thị dạng "{Meta title} \| bibaestudios". Nếu để trống, tiêu đề chỉ là "bibaestudios".
   - Ảnh chia sẻ: dùng ảnh ngang **1200×630 px**. Nếu không có, hệ thống dùng ảnh mặc định của website.
5. Chọn **Xuất bản** (Publish). Trang xuất hiện tại `https://bibaestudios.com/vi/vn/<slug>`. Lưu nháp **không** làm trang hiện ra cho khách.
6. Nhớ chuyển sang **English** và điền bản tiếng Anh nếu muốn trang `/en/vn/<slug>` có nội dung riêng.

**Xem trước:** nút Live Preview có ba khung: Mobile (375×667), Tablet (768×1024), Desktop (1440×900). Xem trước hoạt động với Trang và Bài viết.

**Hẹn giờ xuất bản** có trong giao diện, nhưng trong source không thấy tác vụ định kỳ nào chạy hàng đợi. **Đừng dựa vào hẹn giờ** cho đến khi kỹ thuật xác nhận có cron gọi endpoint jobs của Payload.

**Liên kết trong nội dung** (nút, link):

- _Internal link_ chỉ chọn được **Trang** hoặc **Bài viết**.
- Muốn trỏ tới sản phẩm, danh mục, bộ sưu tập hoặc trang cửa hàng, chọn **Custom URL** và nhập đường dẫn **bắt đầu bằng mã quốc gia, không có ngôn ngữ**:

  | Đích            | Nhập                                   |
  | --------------- | -------------------------------------- |
  | Tất cả sản phẩm | `/vn/store`                            |
  | Một sản phẩm    | `/vn/products/<handle>`                |
  | Một danh mục    | `/vn/categories/<handle>`              |
  | Một bộ sưu tập  | `/vn/collections/<handle>`             |
  | Link ngoài      | `https://...` (có thể chọn mở tab mới) |

  Hệ thống tự thêm `/vi/` hoặc `/en/` trước đường dẫn theo ngôn ngữ đang xem. Nếu bạn quên `/vn`, khách vẫn tới đúng nơi nhờ một lần chuyển hướng tự động, nhưng chậm hơn một chút. **[Cần kiểm tra]** bằng một liên kết thử.

### 5.4 Bài viết (Blog)

- **Bài viết > Tạo mới.** Điền **Title**, ảnh đại diện (**heroImage**), **Content** (rich text; có thể chèn khối Banner, Code, Media), Danh mục, Bài liên quan, Tác giả và tab SEO.
- Bài đã **Xuất bản** hiển thị ở `/vi/vn/posts` và `/vi/vn/posts/<slug>`, đồng thời vào trang tìm kiếm `/vi/vn/search` (trang này chỉ tìm bài viết, không tìm sản phẩm).
- Lưu bản nháp không làm thay đổi gì với khách. Chỉ xuất bản, bỏ xuất bản hoặc xoá mới làm mới trang.

### 5.5 Menu đầu trang (Header)

- **Đầu trang > navItems**: tối đa **6 mục**, khai báo riêng cho từng ngôn ngữ.
  - **Single Link**: một liên kết.
  - **Group**: menu thả xuống nhiều cột. Mỗi cột có _Title_, _Image_, _Description_ và danh sách link (mỗi link có mô tả).
- Mục **"Danh mục"** được **thêm tự động** từ danh mục Medusa (kèm danh mục con). Bạn không cần tạo nó ở đây.
- Bộ chuyển ngôn ngữ, giỏ hàng, ô tìm kiếm là cố định trong code.
- Thay đổi được xác nhận sau xuất bản trong khoảng **1 phút**.
- **Thanh thông báo** ("miễn phí vận chuyển..." chạy luân phiên) **không** sửa được trong CMS. Nó nằm trong tệp dịch của code (`layout.announcement.*`).
- **Chân trang (Footer)**: cửa hàng hiển thị chân trang dựng từ Medusa (danh mục, bộ sưu tập, liên kết blog, chữ giới thiệu cố định). Mục "Chân trang" trong Payload tồn tại nhưng **chưa được gắn vào giao diện**, nên sửa ở đó chưa tạo ra thay đổi. **[Cần kiểm tra]** với kỹ thuật trước khi hướng dẫn biên tập viên dùng.

### 5.6 Thư viện ảnh và video

- Tải lên ở **Hình ảnh & video**. Chấp nhận mọi ảnh và video, tối đa **100 MB**. Trình duyệt tải thẳng lên kho lưu trữ nên video lớn vẫn chạy.
- **Alt Text:** nên điền cho mọi ảnh (mô tả ngắn bằng tiếng Việt). Hệ thống không bắt buộc.
- Hệ thống tự tạo bản thu nhỏ `thumbnail` (400×300), `card` (768×1024), `tablet` (rộng 1024). Ảnh PNG/JPG/WebP/AVIF/HEIC được chuyển sang WebP khi hiển thị (rộng tối đa 2048 px). Ảnh GIF, SVG và video giữ nguyên.
- Khi ảnh được lưu lại (cắt ảnh, đổi điểm lấy nét), địa chỉ ảnh đổi tham số phiên bản, nên trình duyệt và CDN tải bản mới.
- Dán URL: chỉ cho phép một vài tên miền kiểm thử. Hãy tải tệp lên trực tiếp.
- **Video:** nên thêm watermark trước khi tải: `scripts/prepare-video.sh clip.mov --logo logo.png`. Chi tiết bảo vệ ảnh và video: [deploy-digitalocean.md](deploy-digitalocean.md) mục 6.

### 5.7 Biểu mẫu

Plugin biểu mẫu bật sẵn (không có thanh toán, yêu cầu captcha khi khách gửi). Vì **Form Block** chưa chọn được biểu mẫu (5.3),
chưa thể đặt một form lên trang bằng CMS. Cần lập trình viên bổ sung ô chọn biểu mẫu vào khối.

---

## 6. Bao lâu thì thay đổi hiện trên `/vi/vn`

Bảng dưới đây dựa trên code. Cloudflare hoặc bộ nhớ đệm trình duyệt có thể thêm độ trễ.

| Bạn thay đổi                                           | Thời gian hiện                                                                | Ghi chú                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Giá, tồn kho, tên, mô tả, ảnh sản phẩm (Medusa)        | Ngay lần tải trang kế tiếp, sau khi bước đồng bộ sang Payload xong (vài giây) | Trang sản phẩm lấy dữ liệu theo từng yêu cầu                                                                                                         |
| Sản phẩm mới trong ô tìm kiếm                          | Vài giây sau khi lưu                                                          | Chỉ sản phẩm **Published**                                                                                                                           |
| Menu đầu trang (Payload)                               | Khoảng 1 phút sau khi lưu                                                     |                                                                                                                                                      |
| Trang, Bài viết (Payload)                              | Sau khi **Xuất bản**                                                          | **[Cần kiểm tra]** thời gian: hook xoá bộ nhớ đệm dùng đường dẫn không có `/vi/vn`, có thể không khớp. Hãy bấm xuất bản rồi đo thời gian thực tế     |
| **Danh mục, bộ sưu tập** mới, đổi tên                  | **Có thể không tự cập nhật**                                                  | Code lưu dữ liệu này với `force-cache` và không có cơ chế xoá cache. Nếu vài phút sau chưa thấy, nhờ kỹ thuật chạy `scripts/deploy.sh release store` |
| Region mới, đổi quốc gia của Region                    | Bản đồ vùng làm mới mỗi giờ; dữ liệu Region có thể giữ lâu hơn                | Khi thêm Region, nên triển khai lại store                                                                                                            |
| Chuyển hướng (Redirects)                               | Cần build lại                                                                 | Có ghi chú trong chính trường _from_                                                                                                                 |
| Chữ cố định (banner, thanh thông báo, chân trang, nút) | Chỉ sau khi sửa code và triển khai                                            | Mục 7                                                                                                                                                |

---

## 7. Phần cần lập trình viên (không sửa được bằng giao diện)

Những mục sau nằm trong code (`apps/store/src/i18n/messages/areas/*.vi.json` và vài tệp khác):

- Chữ banner trang chủ (2 slide), băng chữ chạy, các giá trị thương hiệu, câu trích.
- Thanh thông báo trên cùng.
- Chữ chân trang và bản quyền.
- Đoạn "Giao hàng nhanh / Đổi hàng / Trả hàng" ở trang sản phẩm.
- Tên nút, thông báo lỗi, nhãn trong giỏ hàng/thanh toán.
- Ảnh nền banner trang chủ: lấy từ ảnh của các sản phẩm mới nhất, không có chỗ chọn ảnh banner riêng.

Ngôn ngữ giao diện cửa hàng: tiếng Việt là gốc. Khoá nào thiếu bản `vi` thì hiện bản tiếng Anh, không hiện tên khoá.

---

## 8. SEO

- Mỗi trang có canonical `/{ngôn ngữ}/{quốc gia}/...` và hreflang `vi`, `en`, `x-default` (= vi).
- Trang sản phẩm có dữ liệu có cấu trúc `Product` (tên, mô tả, SKU, ảnh, giá thấp/cao, `priceCurrency` = VND, tình trạng còn hàng). Để dữ liệu này đúng, mỗi variant cần giá VND và SKU.
- Tiêu đề trang thêm hậu tố " \| bibaestudios".
- Trang thanh toán và tài khoản đặt `noindex`.
- Sơ đồ trang (sitemap): trong code chỉ có sơ đồ `pages-sitemap.xml` và `posts-sitemap.xml`, và một tệp liệt kê trang chủ từng ngôn ngữ. **Sản phẩm và danh mục có thể chưa nằm trong sitemap nào.** **[Cần kiểm tra]** `https://bibaestudios.com/sitemap.xml`.

---

## 9. Danh sách kiểm tra sau khi triển khai

Làm một lần trên môi trường thật, vì source code không cho biết chắc.

1. `https://bibaestudios.com/vi/vn` mở được, có khu sản phẩm. `https://bibaestudios.com/` tự chuyển tới `/vi/vn`.
2. Settings > Regions có "Vietnam" (VND, quốc gia Vietnam). Giá trong Variants là số VND thực tế, không phải giá quy đổi tạm.
3. Settings > Regions > Vietnam > Payment providers: có đúng phương thức muốn dùng (COD và/hoặc payOS). Đặt thử một đơn.
4. Settings > Tax Regions > Vietnam: đã có mức VAT. Giỏ hàng tính thuế đúng.
5. Có ít nhất một Collection và một Category có sản phẩm.
6. Tạo sản phẩm thử theo 4.1. Kiểm tra: trang sản phẩm, thẻ ở `/vi/vn/store`, tìm kiếm, bản ghi trong Payload > Sản phẩm.
7. **Độ nét ảnh thẻ sản phẩm.** Nếu thẻ dùng bản `thumbnail` 400×300 của Payload thì ảnh sẽ bị cắt ngang và mờ khi hiển thị 3:4. Mở `/vi/vn/store` và kiểm tra.
8. Xuất bản một Trang thử và đo thời gian nó hiện ra (mục 6). Đổi tên một danh mục thử và xem khi nào cập nhật.
9. Tạo thử một liên kết Custom URL `/vn/store` trong menu đầu trang, bấm vào xem có tới `/vi/vn/store` không.
10. Hẹn giờ xuất bản: hỏi kỹ thuật xem cron gọi jobs của Payload đã có chưa.
11. Địa chỉ giao hàng: **mã bưu chính là bắt buộc, điện thoại không bắt buộc, tỉnh/thành là ô nhập tự do** (không có danh sách chọn). Nếu muốn đổi, cần sửa code.
12. Tên phương thức thanh toán ở bước thanh toán đang là chữ tiếng Anh cố định (ví dụ "Credit card", "Manual Payment"). Muốn Việt hoá cần sửa code.

---

## 10. Xử lý sự cố

| Hiện tượng                                                     | Nguyên nhân hay gặp                                                                           | Cách xử lý                                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Medusa Admin báo 403 ở mọi màn hình                            | Tài khoản chưa có vai trò                                                                     | `ERP_ADMIN` cấp vai trò ở Vận hành > Phân quyền nhân viên                                                            |
| Nút trong Medusa báo "Permission denied"                       | Vai trò thiếu quyền cho thao tác đó                                                           | Xem bảng quyền trong [backoffice.md](backoffice.md) hoặc xin vai trò phù hợp                                         |
| Sản phẩm không hiện trên `/vi/vn`                              | Chưa Published; không thuộc Sales Channel của khoá API; thiếu giá VND; Region chưa có Vietnam | Làm lại 4.1 và mục 3                                                                                                 |
| Giá hiển thị gấp 100 lần hoặc 1/100                            | Nhập VND sai đơn vị                                                                           | VND nhập theo đồng (`250000`), không nhân 100                                                                        |
| "Hết hàng" dù đã nhập kho                                      | Tồn kho chưa ở đúng kho gắn với Sales Channel; hoặc SKU chưa có inventory level               | Kiểm tra Inventory (4.4)                                                                                             |
| Trang sản phẩm lỗi 502 / trống ngay sau khi triển khai lần đầu | Backend gọi CMS trên máy chủ store nhưng store chưa chạy                                      | Triển khai store, rồi triển khai lần nữa nếu là cài đặt mới ([deploy-digitalocean.md](deploy-digitalocean.md) mục 3) |
| Sản phẩm ở Medusa không có bản ghi trong Payload               | Đồng bộ lỗi hoặc tạo trước khi nối Payload                                                    | Settings > Payload > **Sync Products to Payload**                                                                    |
| Sửa tên/ảnh ở Payload rồi bị mất                               | Lần lưu Medusa kế tiếp ghi đè                                                                 | Sửa ở Medusa (4.5)                                                                                                   |
| Danh mục/bộ sưu tập mới không hiện                             | Cache lâu, không tự xoá                                                                       | Nhờ kỹ thuật triển khai lại store (mục 6)                                                                            |
| Tìm kiếm không thấy sản phẩm mới                               | Chưa Published, hoặc chỉ mục chưa kịp cập nhật. Đổi tên danh mục/tag không tự làm mới chỉ mục | Đợi vài giây; hoặc Settings > Meilisearch > **Sync Data**                                                            |
| Không đăng nhập được Payload                                   | Dùng `admin.bibaestudios.com`                                                                 | Dùng `https://bibaestudios.com/admin`. Tài khoản cần vai trò `admin`                                                 |
| Tải video lên báo lỗi                                          | Lớn hơn 100 MB, hoặc kho lưu trữ chưa cấu hình CORS                                           | Nén/cắt video; báo kỹ thuật                                                                                          |
| Trang Payload đã xuất bản vẫn hiện nội dung cũ                 | Cache trang (mục 6)                                                                           | Đợi vài phút; nếu vẫn cũ, báo kỹ thuật                                                                               |
| `/vi/xx/...` ra 404                                            | Mã quốc gia `xx` không có Region, bị coi là một phần đường dẫn                                | Dùng `/vi/vn/...`                                                                                                    |
| Tìm kiếm trong `/search` không ra sản phẩm                     | Trang đó chỉ tìm bài viết                                                                     | Dùng ô tìm kiếm trên đầu trang để tìm sản phẩm                                                                       |

---

## 11. Phụ lục

### 11.1 Địa chỉ nhanh

| Việc                    | Địa chỉ                                  |
| ----------------------- | ---------------------------------------- |
| Cửa hàng                | `https://bibaestudios.com/vi/vn`         |
| Tất cả sản phẩm         | `/vi/vn/store`                           |
| Sản phẩm                | `/vi/vn/products/<handle>`               |
| Danh mục                | `/vi/vn/categories/<handle>`             |
| Bộ sưu tập              | `/vi/vn/collections/<handle>`            |
| Blog                    | `/vi/vn/posts`                           |
| Trang CMS               | `/vi/vn/<slug>`                          |
| Tìm kiếm bài viết/trang | `/vi/vn/search`                          |
| Payload                 | `https://bibaestudios.com/admin`         |
| Medusa Admin            | `https://ecom.bibaestudios.com` (`/app`) |

### 11.2 Tài liệu liên quan

- [backoffice.md](backoffice.md): màn hình ERP, bảng quyền.
- [deploy-digitalocean.md](deploy-digitalocean.md): triển khai, sao lưu, ảnh và video, tên miền.
- [operations.md](operations.md): vận hành.

### 11.3 Nguồn trong code (để lập trình viên đối chiếu)

| Chủ đề                                        | Tệp                                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Định tuyến `/{locale}/{country}`, chọn Region | `apps/store/src/proxy.ts`, `apps/store/src/i18n/localization.ts`                       |
| Trang sản phẩm, biến thể, tồn kho             | `apps/store/src/modules/products/components/product-actions/index.tsx`                 |
| Nguồn ảnh, thumbnail                          | `apps/store/src/lib/util/payload-images.ts`                                            |
| Dữ liệu trang chủ                             | `apps/store/src/lib/data/home.ts`                                                      |
| Cấu hình Payload, plugin                      | `apps/store/src/payload.config.ts`, `apps/store/src/plugins/index.ts`                  |
| Trang CMS                                     | `apps/store/src/collections/Pages/index.ts`                                            |
| Sản phẩm Payload, đồng bộ ngược               | `apps/store/src/collections/Products.ts`                                               |
| Media                                         | `apps/store/src/collections/Media.ts`                                                  |
| Vai trò và quyền Medusa                       | `apps/medusa/src/lib/authz/permissions.ts`                                             |
| Seed Việt Nam                                 | `infra/deploy/backend/seed-vietnam.py`, `apps/medusa/src/scripts/seed-fashion-demo.ts` |
