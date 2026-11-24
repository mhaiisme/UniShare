// A small, explicit practice fixture. Never modifies an existing user's cards.
const title = 'CTDL & Giải thuật — 12 thẻ học thử';
const description = 'Bộ mẫu UniShare để thử lật thẻ, ghi nhận nhớ/chưa nhớ và ôn tập. Gồm câu trả lời ngắn, dài và ký hiệu độ phức tạp.';
const cards = [
  ['Stack (ngăn xếp) hoạt động theo nguyên tắc nào?', 'LIFO — vào sau, ra trước. Ví dụ: thao tác hoàn tác (Undo). Push và pop trên ngăn xếp có thời gian O(1), nếu không tính việc cấp phát lại vùng nhớ.'],
  ['Queue (hàng đợi) khác Stack như thế nào?', 'Queue dùng FIFO — vào trước, ra trước; Stack dùng LIFO — vào sau, ra trước. Queue thường dùng để xử lý công việc theo thứ tự đến.'],
  ['Truy cập phần tử theo chỉ số trong mảng có độ phức tạp bao nhiêu?', 'O(1), khi chỉ số hợp lệ và các phần tử được lưu liên tiếp trong bộ nhớ.'],
  ['Tìm kiếm nhị phân cần điều kiện gì?', 'Dữ liệu phải được sắp xếp theo cùng thứ tự so sánh dùng trong tìm kiếm. Trên mảng, mỗi bước loại bỏ khoảng một nửa phạm vi, nên thời gian là O(log n).'],
  ['Danh sách liên kết có truy cập phần tử thứ k trong O(1) không?', 'Không trong trường hợp tổng quát. Cần đi qua các nút từ đầu hoặc từ một nút đã biết, nên truy cập phần tử theo vị trí có thời gian O(n) trong trường hợp xấu nhất.'],
  ['Hash table có luôn tìm kiếm trong O(1) không?', 'Không. Thời gian kỳ vọng thường là O(1) khi hàm băm và hệ số tải phù hợp. Trong trường hợp nhiều va chạm, cách xử lý va chạm có thể khiến thời gian tìm kiếm tăng đến O(n).'],
  ['BFS sử dụng cấu trúc dữ liệu nào?', 'Hàng đợi (Queue). BFS duyệt theo từng lớp và tìm đường đi có ít cạnh nhất từ đỉnh nguồn trong đồ thị không trọng số.'],
  ['DFS sử dụng cấu trúc dữ liệu nào?', 'Ngăn xếp (Stack), có thể là ngăn xếp tường minh hoặc ngăn xếp lời gọi khi dùng đệ quy.'],
  ['Độ phức tạp của BFS và DFS khi dùng danh sách kề?', 'O(V + E), với V là số đỉnh và E là số cạnh, khi duyệt toàn bộ đồ thị và đánh dấu mỗi đỉnh đã thăm.'],
  ['Điều kiện quan trọng khi dùng thuật toán Dijkstra?', 'Các cạnh phải có trọng số không âm. Với cạnh âm, kết quả Dijkstra có thể sai; cần chọn thuật toán phù hợp, chẳng hạn Bellman–Ford nếu không có chu trình âm ảnh hưởng đến đường đi cần tìm.'],
  ['Đệ quy cần hai thành phần nào để kết thúc?', 'Điều kiện dừng và bước đệ quy tiến gần đến điều kiện dừng. Thiếu một trong hai có thể gây đệ quy vô hạn hoặc tràn ngăn xếp.'],
  ['O(n), O(log n) và O(n²): loại nào tăng chậm nhất khi n đủ lớn?', 'O(log n) tăng chậm nhất trong ba lớp này, tiếp theo là O(n), rồi O(n²). Đây là so sánh tốc độ tăng tiệm cận; thời gian chạy thực tế còn phụ thuộc hằng số, dữ liệu và cách cài đặt.'],
];

function loadDemoDeck(db, userId) {
  // Lookup and insertion stay in one transaction; repeated clicks reuse the deck.
  return db.tx(() => {
    const existing = db.get('SELECT id FROM flashcard_decks WHERE user_id = ? AND title = ? AND description = ? ORDER BY id LIMIT 1', [userId, title, description]);
    if (existing) return { id: existing.id, created: false };
    const id = db.run('INSERT INTO flashcard_decks (user_id, title, description) VALUES (?, ?, ?)', [userId, title, description]).lastInsertRowid;
    cards.forEach(([front, back]) => db.run('INSERT INTO flashcards (deck_id, front, back, box, next_review) VALUES (?, ?, ?, 1, NULL)', [id, front, back]));
    return { id, created: true };
  });
}

module.exports = { loadDemoDeck };
