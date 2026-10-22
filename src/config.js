module.exports = {
  APP_NAME: 'UniShare',
  PORT: Number(process.env.PORT) || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || 'unishare-dev-secret-change-me',

  PREVIEW_RATIO: 0.2, // xem trước 20%
  DOC_COMMISSION_RATE: 0.2, // hoa hồng nền tảng 20% trên mỗi tài liệu bán
  DOC_MIN_PRICE: 5000,
  DOC_MAX_PRICE: 2000000,
  MARKET_FEE_RATE: 0.05, // phí giao dịch giáo trình 5%
  MARKET_FEE_MIN: 2000,

  PREMIUM_PLANS: {
    month: { name: 'Premium Tháng', price: 49000, days: 30 },
    semester: { name: 'Premium Học kỳ', price: 199000, days: 150 },
    year: { name: 'Premium Năm', price: 349000, days: 365 },
  },

  POINTS: { signup: 5, approvedUpload: 3, unlockCost: 1 },
  FREE_DECK_LIMIT: 1,
  FREE_CARD_LIMIT: 20,
  LEITNER_DAYS: [0, 1, 3, 7, 14, 30], // index = box

  STRIKE_BAN: 3,
  TAKEDOWN_HOURS: 72,
  SIMILARITY_THRESHOLD: 0.5,
  UPLOAD_MAX_MB: 50,

  DOC_TYPES: {
    study_guide: 'Đề cương / Study guide',
    cheat_sheet: 'Cheat sheet / Công thức',
    mindmap: 'Sơ đồ tư duy',
    solution: 'Lời giải chi tiết đề thi',
    exam_questions: 'Câu hỏi ôn tập / Đề thi cũ',
    report: 'Báo cáo / Đồ án mẫu',
    source_code: 'Source code',
    course: 'Khoá học video P2P',
    experience: 'Kinh nghiệm làm bài thi',
  },

  DOC_STATUS: {
    approved: 'Đã duyệt',
    pending: 'Chờ duyệt',
    flagged: 'Bị gắn cờ – chờ kiểm duyệt',
    rejected: 'Bị từ chối',
    taken_down: 'Đã gỡ (vi phạm bản quyền)',
    deleted: 'Đã xoá',
  },

  CONDITIONS: {
    new: 'Mới 99%',
    good: 'Tốt',
    fair: 'Khá (có ghi chú)',
    worn: 'Cũ',
  },

  ORDER_STATUS: {
    pending: 'Chờ người bán xác nhận',
    confirmed: 'Đã xác nhận – chờ giao nhận',
    completed: 'Hoàn tất',
    cancelled: 'Đã huỷ',
  },

  POST_CATEGORIES: {
    experience: 'Kinh nghiệm thi',
    question: 'Hỏi đáp ôn tập',
    tips: 'Mẹo học tập',
    old_exams: 'Trao đổi đề thi cũ',
  },

  REPORTER_ROLES: {
    lecturer: 'Giảng viên',
    school: 'Nhà trường',
    author: 'Tác giả gốc',
    publisher: 'Nhà xuất bản',
    other: 'Khác',
  },

  REVENUE_SOURCES: {
    premium: 'Gói Premium',
    commission: 'Hoa hồng tài liệu',
    txn_fee: 'Phí giao dịch giáo trình',
    ads: 'Quảng cáo',
  },

  ALLOWED_DOC_EXT: [
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.md', '.zip', '.rar',
    '.png', '.jpg', '.jpeg', '.mp4', '.webm',
    '.c', '.cpp', '.h', '.java', '.py', '.js', '.ts', '.cs', '.sql', '.html', '.css', '.ipynb',
  ],
  TEXT_EXT: ['.txt', '.md', '.c', '.cpp', '.h', '.java', '.py', '.js', '.ts', '.cs', '.sql', '.html', '.css'],
  VIDEO_EXT: ['.mp4', '.webm'],
  IMAGE_EXT: ['.png', '.jpg', '.jpeg'],
};
