/**
 * Kiểm thử end-to-end tự động toàn bộ luồng nghiệp vụ của UniShare.
 * Chạy trên thư mục dữ liệu tạm riêng để không ảnh hưởng CSDL chính.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unishare-test-'));
process.env.DATA_DIR = tmpDir;

const db = require('../src/db');
const { createApp } = require('../src/app');

class Client {
  constructor(base) {
    this.base = base;
    this.cookie = '';
  }
  async req(method, url, { form, json, multipart, follow = true } = {}) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    let body;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    } else if (json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (multipart) {
      body = multipart;
    }
    const res = await fetch(this.base + url, { method, headers, body, redirect: 'manual' });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookie) this.cookie = c.split(';')[0];
    if (follow && [301, 302, 303].includes(res.status)) {
      const loc = res.headers.get('location');
      return this.req('GET', loc.startsWith('http') ? new URL(loc).pathname + new URL(loc).search : loc);
    }
    const ct = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, buf, text: ct.includes('pdf') ? '' : buf.toString('utf8') };
  }
  get(u, o) { return this.req('GET', u, o); }
  post(u, form, o = {}) { return this.req('POST', u, { ...o, form }); }
}

async function makeSamplePdf(pages = 5, extraText = '') {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = pdf.addPage([400, 500]);
    p.drawText(`Page ${i} - Study guide tu bien soan ${extraText}`, { x: 30, y: 440, size: 12, font });
  }
  return Buffer.from(await pdf.save());
}

function step(name) {
  process.stdout.write(`  • ${name} ... `);
}
function ok() {
  console.log('OK');
}

(async () => {
  console.log('🧪 Chạy kiểm thử end-to-end UniShare\n');
  const app = await createApp();
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const guest = new Client(base);
    const sv1 = new Client(base);
    const sv2 = new Client(base);
    const admin = new Client(base);

    step('Trang chủ, tìm kiếm, chợ, diễn đàn, điều khoản, DMCA');
    for (const u of ['/', '/search', '/market', '/forum', '/terms', '/dmca', '/premium', '/login', '/register']) {
      const r = await guest.get(u);
      assert.strictEqual(r.status, 200, `GET ${u} -> ${r.status}`);
    }
    ok();

    step('Khách chỉ xem được 20% preview tài liệu');
    const previewRes = await guest.get('/documents/1');
    assert.strictEqual(previewRes.status, 200);
    assert(previewRes.text.includes('Bạn đang xem trước 20%'), 'Phải có thông báo preview 20%');
    ok();

    step('Đăng ký tài khoản mới tặng 5 điểm & mở khoá tài liệu miễn phí bằng 1 điểm');
    await sv1.post('/register', {
      name: 'Phạm Quốc Duy', email: 'duy@student.vn', password: 'password123', password2: 'password123', school_id: 1, major: 'CNTT', agree: '1',
    });
    let u1 = db.get("SELECT * FROM users WHERE email = 'duy@student.vn'");
    assert.strictEqual(u1.points, 5);
    await sv1.post('/documents/1/unlock', {});
    u1 = db.get("SELECT * FROM users WHERE email = 'duy@student.vn'");
    assert.strictEqual(u1.points, 4);
    const unlockedRes = await sv1.get('/documents/1');
    assert(!unlockedRes.text.includes('Bạn đang xem trước 20%'), 'Sau mở khoá phải xem được toàn bộ');
    ok();

    step('Đăng tài liệu phải tích cam kết bản quyền (click-wrap)');
    const noAgree = await sv1.post('/documents', {
      title: 'Tài liệu thiếu cam kết', doc_type: 'study_guide', school_id: 1, course_code: 'IT3011', content: 'Nội dung tự soạn dài hơn mười ký tự',
    });
    assert.strictEqual(noAgree.status, 400);
    assert(noAgree.text.includes('cam kết bản quyền'));
    ok();

    step('Đăng tài liệu kèm PDF sạch -> tự động duyệt (+3 điểm) & PDF đóng dấu chìm động (preview 20% trang cho khách, đủ trang cho chủ sở hữu)');
    const pdfBuf = await makeSamplePdf(5);
    const fd = new FormData();
    fd.set('title', 'Tóm tắt Mạng máy tính tự soạn kèm PDF');
    fd.set('description', 'Bản tóm tắt các tầng OSI');
    fd.set('doc_type', 'study_guide');
    fd.set('school_id', '1');
    fd.set('course_code', 'IT3080');
    fd.set('price', '50000');
    fd.set('allow_download', '1');
    fd.set('agree_copyright', '1');
    fd.set('content', '- Tầng vật lý: truyền bit trên môi trường vật lý\n- Tầng liên kết dữ liệu: truyền khung tin giữa hai nút kề nhau\n- Tầng mạng: định tuyến gói tin qua các mạng\n- Tầng giao vận: truyền dữ liệu đầu cuối tin cậy');
    fd.set('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'mang-may-tinh.pdf');
    await sv1.req('POST', '/documents', { multipart: fd });
    const newDoc = db.get("SELECT * FROM documents WHERE title LIKE 'Tóm tắt Mạng máy tính%'");
    assert(newDoc && newDoc.status === 'approved', 'Tài liệu sạch phải được duyệt tự động');
    u1 = db.get('SELECT * FROM users WHERE id = ?', [u1.id]);
    assert.strictEqual(u1.points, 7);

    // Khách xem file PDF -> chỉ nhận ceil(5 * 0.2) = 1 trang
    const guestPdf = await guest.get(`/documents/${newDoc.id}/file`);
    assert.strictEqual(guestPdf.status, 200);
    const guestDoc = await PDFDocument.load(guestPdf.buf);
    assert.strictEqual(guestDoc.getPageCount(), 1, 'Khách chỉ nhận 1/5 trang preview');

    // Chủ sở hữu xem file PDF -> đủ 5 trang
    const ownerPdf = await sv1.get(`/documents/${newDoc.id}/file`);
    const ownerDoc = await PDFDocument.load(ownerPdf.buf);
    assert.strictEqual(ownerDoc.getPageCount(), 5, 'Chủ sở hữu nhận đủ 5 trang');
    ok();

    step('Pipeline kiểm duyệt: từ khoá "Lưu hành nội bộ" / "Nhà xuất bản" bị gắn cờ -> Admin duyệt thủ công');
    await sv1.post('/documents', {
      title: 'Slide bài giảng có dấu hiệu bản quyền', doc_type: 'study_guide', school_id: 1, course_code: 'IT3080',
      content: 'Tài liệu Lưu hành nội bộ của Nhà xuất bản Giáo dục, ISBN 978-604-0-00000-0.', agree_copyright: '1',
    });
    const flaggedDoc = db.get("SELECT * FROM documents WHERE title LIKE 'Slide bài giảng%'");
    assert.strictEqual(flaggedDoc.status, 'flagged');
    // Khách không xem được tài liệu đang flagged
    const hiddenRes = await guest.get('/documents/' + flaggedDoc.id, { follow: false });
    assert.strictEqual(hiddenRes.status, 404);

    await admin.post('/login', { email: 'admin@unishare.vn', password: 'admin123' });
    await admin.post(`/admin/documents/${flaggedDoc.id}/approve`, {});
    assert.strictEqual(db.get('SELECT status FROM documents WHERE id = ?', [flaggedDoc.id]).status, 'approved');
    ok();

    step('Pipeline kiểm duyệt: nội dung sao chép (similarity >= 50%) bị gắn cờ');
    const existing = db.get('SELECT content FROM documents WHERE id = 1').content;
    await sv1.post('/documents', {
      title: 'Bản sao chép từ tài liệu số 1', doc_type: 'cheat_sheet', school_id: 1, course_code: 'IT3011',
      content: existing, agree_copyright: '1',
    });
    const copyDoc = db.get("SELECT * FROM documents WHERE title LIKE 'Bản sao chép%'");
    assert.strictEqual(copyDoc.status, 'flagged');
    assert(copyDoc.similarity >= 0.5, 'Similarity phải >= 0.5');
    ok();

    step('Nạp ví, mua tài liệu trả phí -> chia 80% cho tác giả, 20% hoa hồng nền tảng & đánh giá');
    await sv2.post('/login', { email: 'binh@student.vn', password: '123456' });
    await sv2.post('/wallet/topup', { amount: '100000', method: 'vnpay' });
    const authorBefore = db.get('SELECT balance FROM users WHERE id = ?', [u1.id]).balance;
    await sv2.post(`/documents/${newDoc.id}/buy`, {});
    const authorAfter = db.get('SELECT balance FROM users WHERE id = ?', [u1.id]).balance;
    assert.strictEqual(authorAfter - authorBefore, 40000, 'Tác giả nhận 80% của 50.000đ = 40.000đ');
    const comm = db.get("SELECT amount FROM revenue WHERE source = 'commission' AND ref = ?", ['doc#' + newDoc.id]);
    assert.strictEqual(comm.amount, 10000, 'Nền tảng nhận 20% = 10.000đ');
    await sv2.post(`/documents/${newDoc.id}/review`, { rating: '5', comment: 'Tài liệu rất chất lượng!' });
    assert.strictEqual(db.get('SELECT rating_avg FROM documents WHERE id = ?', [newDoc.id]).rating_avg, 5);
    ok();

    step('Mua gói Premium -> tự sinh Flashcard AI từ tài liệu, học Leitner & làm Quiz');
    await sv2.post('/premium/buy', { plan: 'month' });
    const binhUser = db.get("SELECT * FROM users WHERE email = 'binh@student.vn'");
    assert(binhUser.premium_until, 'Phải có hạn Premium');
    await sv2.post(`/documents/${newDoc.id}/flashcards`, {});
    const genDeck = db.get('SELECT * FROM flashcard_decks WHERE user_id = ? AND document_id = ?', [binhUser.id, newDoc.id]);
    assert(genDeck, 'Phải tạo được bộ flashcard từ tài liệu');
    const genCards = db.all('SELECT * FROM flashcards WHERE deck_id = ?', [genDeck.id]);
    assert(genCards.length >= 4, 'Phải sinh được ít nhất 4 thẻ');
    const revRes = await sv2.req('POST', `/flashcards/${genDeck.id}/cards/${genCards[0].id}/review`, { json: { result: 'good' } });
    assert.strictEqual(revRes.status, 200);
    assert.strictEqual(db.get('SELECT box FROM flashcards WHERE id = ?', [genCards[0].id]).box, 2);
    const quizPage = await sv2.get(`/flashcards/${genDeck.id}/quiz`);
    assert.strictEqual(quizPage.status, 200);
    assert(quizPage.text.includes('Câu 1'));
    ok();

    step('Chợ giáo trình cũ: đăng bán -> đặt mua (giữ ký quỹ) -> xác nhận -> hoàn tất (trừ phí 5%)');
    await sv1.post('/market', {
      title: 'Sách Mạng máy tính Andrew Tanenbaum', author: 'Tanenbaum', course_code: 'IT3080',
      school_id: '1', condition: 'good', price: '100000', location: 'Bách Khoa', description: 'Sách còn rất mới',
    });
    const listing = db.get("SELECT * FROM listings WHERE title LIKE 'Sách Mạng máy tính%'");
    const s1Before = db.get('SELECT balance FROM users WHERE id = ?', [u1.id]).balance;
    await sv2.post(`/market/${listing.id}/order`, { note: 'Hẹn ở thư viện Tạ Quang Bửu' });
    const order = db.get('SELECT * FROM orders WHERE listing_id = ?', [listing.id]);
    assert.strictEqual(order.status, 'pending');
    assert.strictEqual(db.get('SELECT status FROM listings WHERE id = ?', [listing.id]).status, 'reserved');
    await sv1.post(`/orders/${order.id}/confirm`, {});
    assert.strictEqual(db.get('SELECT status FROM orders WHERE id = ?', [order.id]).status, 'confirmed');
    await sv2.post(`/orders/${order.id}/complete`, {});
    assert.strictEqual(db.get('SELECT status FROM orders WHERE id = ?', [order.id]).status, 'completed');
    const s1After = db.get('SELECT balance FROM users WHERE id = ?', [u1.id]).balance;
    assert.strictEqual(s1After - s1Before, 95000, 'Người bán nhận 95.000đ (trừ 5% phí)');
    ok();

    step('Quy trình Notice & Takedown (DMCA): báo cáo -> Admin gỡ bỏ + chặn hash -> chặn upload lại file đó');
    await guest.post('/dmca', {
      document_id: String(newDoc.id), reporter_name: 'TS. Nguyễn Giảng Viên', reporter_email: 'gv@hust.edu.vn',
      reporter_role: 'lecturer', original_work: 'Bài giảng Mạng máy tính',
      reason: 'Tài liệu này sử dụng nội dung bài giảng của tôi khi chưa xin phép.', evidence_url: 'https://example.edu.vn/proof', good_faith: '1',
    });
    const report = db.get('SELECT * FROM reports WHERE document_id = ?', [newDoc.id]);
    assert(report && report.status === 'open');
    await admin.post(`/admin/reports/${report.id}/takedown`, { note: 'Xác nhận vi phạm', blacklist_hash: '1' });
    assert.strictEqual(db.get('SELECT status FROM documents WHERE id = ?', [newDoc.id]).status, 'taken_down');
    assert.strictEqual(db.get('SELECT strikes FROM users WHERE id = ?', [u1.id]).strikes, 1);

    // Thử đăng lại đúng file PDF đã bị blacklist hash -> phải bị rejected ngay
    const fd2 = new FormData();
    fd2.set('title', 'Đăng lại file đã bị gỡ');
    fd2.set('doc_type', 'study_guide');
    fd2.set('school_id', '1');
    fd2.set('course_code', 'IT3080');
    fd2.set('agree_copyright', '1');
    fd2.set('file', new Blob([pdfBuf], { type: 'application/pdf' }), 'reupload.pdf');
    await sv1.req('POST', '/documents', { multipart: fd2 });
    const reDoc = db.get("SELECT * FROM documents WHERE title = 'Đăng lại file đã bị gỡ'");
    assert.strictEqual(reDoc.status, 'rejected', 'File có hash trong blacklist phải bị từ chối');
    ok();

    step('Diễn đàn & Quảng cáo & các trang Admin');
    await sv1.post('/forum', { category: 'tips', school_id: '1', course_code: 'IT3080', title: 'Mẹo nhớ 7 tầng OSI trong 2 phút', body: 'Áp dụng câu thần chú Please Do Not Throw Sausage Pizza Away.' });
    const post = db.get("SELECT * FROM posts WHERE title LIKE 'Mẹo nhớ 7 tầng%'");
    await sv2.post(`/forum/${post.id}/comments`, { body: 'Hay quá, cảm ơn bạn!' });
    assert.strictEqual(db.get('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?', [post.id]).c, 1);

    const clicksBefore = db.get('SELECT clicks FROM ads WHERE id = 1').clicks;
    const adClick = await guest.req('GET', '/ads/1/click', { follow: false });
    assert.strictEqual(adClick.status, 302);
    assert.strictEqual(db.get('SELECT clicks FROM ads WHERE id = 1').clicks, clicksBefore + 1);

    for (const u of ['/admin', '/admin/moderation', '/admin/reports', '/admin/documents', '/admin/users', '/admin/ads', '/admin/blacklist', '/admin/schools']) {
      const r = await admin.get(u);
      assert.strictEqual(r.status, 200, `GET ${u} -> ${r.status}`);
    }
    ok();

    console.log('\n✅ Tất cả kiểm thử đều vượt qua!\n');
  } finally {
    server.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error('\n❌ Kiểm thử thất bại:', e);
  process.exit(1);
});
