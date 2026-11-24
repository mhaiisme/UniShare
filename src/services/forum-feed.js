const categories = require('../config').POST_CATEGORIES;

const text = value => String(value == null ? '' : value).normalize('NFC');

function presentAuthor(row) {
  const name = text(row.author_name || 'Thành viên UniShare');
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || 'U').slice(0, 2);
  return { ...row, author_name: name, author_initials: initials.toLocaleUpperCase('vi-VN'), avatar_tone: Math.abs(Number(row.user_id) || 0) % 5 };
}

function presentPost(row) {
  return {
    ...presentAuthor(row),
    title: text(row.title),
    body: text(row.body),
    category: Object.hasOwn(categories, row.category) ? row.category : 'question',
    comment_count: Number(row.comment_count) || 0,
    excerpt: text(row.body)
      .replace(/```[\s\S]*?```/g, ' [Đoạn mã trong bài viết] ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(^|\n)\s*[#>+*-]+\s*/g, ' ')
      .replace(/[*`_]/g, '')
      .replace(/\s+/g, ' ').trim(),
  };
}

const selectPosts = `SELECT p.*, u.name AS author_name, s.code AS school_code,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
  FROM posts p JOIN users u ON u.id = p.user_id
  LEFT JOIN schools s ON s.id = p.school_id`;

function getForumFeed(db, query = {}) {
  const category = Object.hasOwn(categories, String(query.category || '')) ? String(query.category) : '';
  const q = text(query.q).trim();
  const course = text(query.course).trim();
  const response = ['unanswered', 'answered'].includes(query.response) ? query.response : '';
  const sort = query.sort === 'discussed' ? 'discussed' : 'newest';
  const where = ['1 = 1'];
  const params = [];
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (q) { where.push('(p.title LIKE ? OR p.body LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (course) { where.push('p.course_code LIKE ?'); params.push(`%${course}%`); }
  if (response) where.push(`${response === 'unanswered' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id)`);
  const condition = where.join(' AND ');
  const total = db.get(`SELECT COUNT(*) AS n FROM posts p WHERE ${condition}`, params).n;
  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(query.page, 10) || 1));
  const order = sort === 'discussed' ? 'comment_count DESC, p.created_at DESC, p.id DESC' : 'p.created_at DESC, p.id DESC';
  const posts = db.all(`${selectPosts} WHERE ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]).map(presentPost);
  const counts = db.get(`SELECT COUNT(*) AS posts,
    (SELECT COUNT(*) FROM comments) AS comments,
    SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id) THEN 1 ELSE 0 END) AS unanswered
    FROM posts p`);
  counts.unanswered = Number(counts.unanswered) || 0;
  const unanswered = db.all(`${selectPosts} WHERE p.category = 'question'
    AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id)
    ORDER BY p.created_at DESC, p.id DESC LIMIT 3`).map(presentPost);
  const discussed = db.all(`${selectPosts} WHERE EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id)
    ORDER BY comment_count DESC, p.created_at DESC, p.id DESC LIMIT 3`).map(presentPost);
  const topics = db.all(`SELECT p.course_code, COUNT(*) AS post_count FROM posts p
    WHERE TRIM(COALESCE(p.course_code, '')) <> '' GROUP BY p.course_code
    ORDER BY post_count DESC, p.course_code LIMIT 6`);
  return { posts, f: { category, q, course, response, sort }, total, page, pages, pageSize, counts, unanswered, discussed, topics };
}

module.exports = { getForumFeed, presentPost, presentAuthor };
