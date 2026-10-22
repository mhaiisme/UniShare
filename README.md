# 📚 UniShare – Nền tảng chia sẻ tài liệu ôn thi & chợ giáo trình cũ cho sinh viên

Dự án mẫu đầy đủ chức năng theo đặc tả trong [`SPEC.md`](./SPEC.md):

1. **Chuyển đổi nội dung sang tài sản hợp pháp (Content Pivot):** study guide, cheat sheet, mindmap, lời giải chi tiết, báo cáo/đồ án mẫu, source code, khoá học video P2P, kinh nghiệm thi.
2. **Cơ chế miễn trừ trách nhiệm (Safe Harbor – Điều 198b Luật SHTT 2022 & NĐ 17/2023/NĐ-CP):**
   - Cam kết bản quyền bắt buộc (**Click-wrap Agreement**) có lưu thời gian & IP.
   - Quy trình **Thông báo và Gỡ bỏ (Notice & Takedown)** với hạn xử lý **72 giờ**, cơ chế **3 lần cảnh cáo (strike) → khoá tài khoản**.
3. **4 mô hình doanh thu:**
   - **Freemium + Điểm + Thuê bao Premium** (preview 20%, mở khoá bằng điểm khi đăng tài liệu, hoặc mua gói Premium Tháng / Học kỳ / Năm).
   - **Chợ thương mại tài liệu thu hoa hồng 20%** (tác giả nhận 80%) + **Chợ giáo trình cũ có giữ ký quỹ (escrow)** thu phí giao dịch 5%.
   - **AI Study Tools (Premium):** tự động sinh Flashcard từ tài liệu, học lặp lại ngắt quãng Leitner 5 hộp, tạo đề Quiz trắc nghiệm 4 đáp án.
   - **Quảng cáo đối tác** (nhà sách, trung tâm ngoại ngữ, khoá học, dịch vụ SV) có thống kê hiển thị/click/CTR; tự động ẩn với thành viên Premium.
4. **Kiểm soát nội dung & chống thất thoát doanh thu (Anti-Piracy):**
   - **Pipeline kiểm duyệt tự động** khi upload: chặn **SHA-256 hash** trong blacklist, gắn cờ **từ khoá bản quyền** ("Lưu hành nội bộ", "Nhà xuất bản", "ISBN"...) và **độ tương đồng văn bản** (shingling ≥ 50%) để kiểm duyệt viên duyệt thủ công.
   - **Trình đọc bảo vệ bản quyền:** chặn copy / chuột phải / in / Ctrl+S, **watermark động** (email + ID người xem) di chuyển ngẫu nhiên trên tài liệu & video, và **đóng dấu chìm trực tiếp lên từng trang PDF** bằng `pdf-lib` (khách chỉ nhận 20% số trang đầu).

---

## Cách chạy trên VS Code

Yêu cầu duy nhất: **Node.js ≥ 18** (không cần cài đặt cơ sở dữ liệu – dự án dùng SQLite qua `sql.js`).

```bash
# 1. Mở thư mục dự án trong VS Code rồi mở Terminal:
npm install

# 2. (Tuỳ chọn) Tạo lại dữ liệu mẫu:
npm run seed

# 3. Chạy kiểm thử tự động toàn bộ luồng:
npm test

# 4. Khởi động máy chủ:
npm start
```

Mở trình duyệt tại **http://localhost:3000**

### Tài khoản demo có sẵn

| Vai trò | Email | Mật khẩu | Ghi chú |
|---|---|---|---|
| Quản trị viên | `admin@unishare.vn` | `admin123` | Duyệt tài liệu, xử lý DMCA, xem doanh thu |
| SV Premium | `an@student.vn` | `123456` | Ví 500.000đ, đã có gói Premium |
| SV thường | `binh@student.vn` | `123456` | Ví 200.000đ, 5 điểm |
| SV thường | `chi@student.vn` | `123456` | Ví 100.000đ, 5 điểm |
