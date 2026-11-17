# Vận hành PostgreSQL, Redis và session

## Readiness

- `GET /api/health/ready` trả HTTP 200 chỉ khi cả PostgreSQL và Redis trả lời được.
- Nếu một dependency không sẵn sàng, endpoint trả HTTP 503 cùng trạng thái riêng của từng dependency.
- `GET /api/health` chỉ là liveness; không dùng nó làm điều kiện nhận traffic nghiệp vụ.

## Khởi động lệch thời điểm

- PostgreSQL sẵn sàng trước Redis: tiến trình giữ retry attach realtime gateway với backoff tối đa 10 giây; HTTP listener chỉ mở sau khi Redis adapter khởi tạo thành công.
- Redis sẵn sàng trước PostgreSQL: gateway có thể khởi tạo; HTTP readiness vẫn 503 cho tới khi PostgreSQL query thành công. `pg.Pool` tạo lại connection sau lỗi kết nối.
- Không chạy migration tự động khi server boot. Triển khai migration theo quy trình riêng sau khi backup và kiểm tra tương thích.

## Khi Redis gián đoạn lúc runtime

- Redis client retry có giới hạn; command không được xếp hàng vô hạn khi Redis chưa ready.
- Production rate-limit fail-closed bằng HTTP 503 khi Redis không thể xác minh giới hạn.
- PostgreSQL là nguồn dữ liệu session bền vững. Refresh rotation được commit trong PostgreSQL; Redis không phải nguồn quyết định token hợp lệ.
- Gateway không xác minh được ownership sẽ ngắt socket realtime. Client phải reconnect sau khi Redis và readiness phục hồi.

## Session cleanup và audit growth

- Scheduler chạy mỗi giờ; PostgreSQL advisory lock bảo đảm chỉ một gateway thực hiện một lượt.
- Session hết hạn được giữ thêm 7 ngày; session đã thu hồi được giữ thêm 1 ngày trước khi cleanup theo batch tối đa 500 dòng.
- Refresh-token history được xóa theo session bằng foreign key cascade.
- Audit log và refresh-token history được đo riêng bằng số dòng ước tính và dung lượng; audit log còn ghi mốc thời gian cũ nhất/mới nhất. Không quét toàn bảng để đếm chính xác mỗi giờ và không tự động xóa/partition audit log cho tới khi có chính sách retention được phê duyệt.
