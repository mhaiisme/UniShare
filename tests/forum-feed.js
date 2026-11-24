/* Deterministic forum checks against an isolated, in-memory database. */
const assert = require('assert/strict');
const path = require('path');
const ejs = require('ejs');
const { getForumFeed, presentPost, presentAuthor } = require('../src/services/forum-feed');
const config = require('../src/config');
const u = require('../src/utils');

(async () => {
  const SQL = await require('sql.js')();
  const memory = new SQL.Database();
  memory.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE schools(id INTEGER PRIMARY KEY, code TEXT, name TEXT);
    CREATE TABLE posts(id INTEGER PRIMARY KEY, user_id INTEGER, school_id INTEGER, category TEXT, course_code TEXT, title TEXT, body TEXT, created_at TEXT);
    CREATE TABLE comments(id INTEGER PRIMARY KEY, post_id INTEGER, user_id INTEGER, body TEXT, created_at TEXT);
    INSERT INTO users VALUES(1, 'Nguyễn Minh An'),(2, 'Trần Hà');
    INSERT INTO schools VALUES(1, 'UET', 'Trường Đại học Công nghệ');`);
  const db = {
    all(sql, params = []) {
      const statement = memory.prepare(sql);
      try { statement.bind(params); const rows = []; while (statement.step()) rows.push(statement.getAsObject()); return rows; }
      finally { statement.free(); }
    },
    get(sql, params) { return this.all(sql, params)[0]; },
  };
  for (let id = 1; id <= 29; id++) {
    memory.run('INSERT INTO posts VALUES(?,?,?,?,?,?,?,?)', [id, id % 2 + 1, 1, id % 3 ? 'question' : 'tips', id % 2 ? 'INT2210' : 'MAT1093', `Câu hỏi ${id} <script>`, `**Nội dung** ôn tập ${id}`, '2026-11-24 10:00:00']);
    for (let n = 0; n < id % 4; n++) memory.run('INSERT INTO comments(post_id,user_id,body,created_at) VALUES(?,?,?,?)', [id, 1, 'Một phản hồi hữu ích', '2026-11-24 11:00:00']);
  }
  const first = getForumFeed(db);
  assert.equal(first.total, 29);
  assert.equal(first.pages, 3);
  assert.equal(first.posts.length, 12);
  assert.equal(first.posts[0].id, 29);
  const second = getForumFeed(db, { page: 2 });
  assert(!second.posts.some(p => first.posts.some(other => p.id === other.id)));
  assert.equal(getForumFeed(db, { page: 999 }).page, 3);
  assert.equal(getForumFeed(db, { page: -10 }).page, 1);
  const filtered = getForumFeed(db, { category: 'question', course: 'MAT1093', response: 'unanswered' });
  assert.equal(filtered.total, 5);
  assert(filtered.posts.every(p => p.category === 'question' && p.course_code === 'MAT1093' && p.comment_count === 0));
  const unanswered = getForumFeed(db, { response: 'unanswered' });
  assert.equal(unanswered.total, 7);
  assert(unanswered.posts.every(p => p.comment_count === 0));
  const answered = getForumFeed(db, { response: 'answered' });
  assert.equal(answered.total, 22);
  assert(answered.posts.every(p => p.comment_count > 0));
  const ranked = getForumFeed(db, { sort: 'discussed' });
  assert(ranked.posts.every((p, i, rows) => !i || rows[i - 1].comment_count >= p.comment_count));
  assert(first.unanswered.every(p => p.category === 'question' && p.comment_count === 0));
  assert(first.discussed.every(p => p.comment_count > 0));
  assert.equal(first.topics.reduce((n, t) => n + t.post_count, 0), 29);
  assert.equal(getForumFeed(db, { q: "' OR 1=1 --" }).total, 0);
  assert.equal(getForumFeed(db, { category: '__proto__', response: 'invalid', sort: 'invalid' }).f.category, '');
  assert.equal(presentAuthor({ author_name: 'Nguye\u0302\u0303n Minh An' }).author_name, 'Nguyễn Minh An');
  assert.equal(presentAuthor({ author_name: 'Nguyễn Minh An' }).author_initials, 'NA');
  const shared = { config, u, path: '/forum', query: {}, currentUser: null, premium: false, unread: 0, flash: null, ads: { home: [], sidebar: [] } };
  const render = (name, locals) => ejs.renderFile(path.join(__dirname, '..', 'views', 'forum', name + '.ejs'), { ...shared, ...locals });
  const index = await render('index', { title: 'Diễn đàn', ...first });
  assert(index.includes('Cùng hỏi,'));
  assert(index.includes('&lt;script&gt;'));
  assert(!index.includes('Câu hỏi 29 <script>'));
  assert(index.includes('forum-topic-panel'));
  const empty = await render('index', { title: 'Diễn đàn', ...getForumFeed(db, { q: 'missing-title' }) });
  assert(empty.includes('Chưa tìm thấy cuộc trao đổi phù hợp'));
  assert(!empty.includes('<article class="forum-post '));
  const post = presentPost({ ...first.posts[0], school_name: 'Trường Đại học Công nghệ' });
  const comments = db.all('SELECT c.*,u.name AS author_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=?', [post.id]).map(presentAuthor);
  const guest = await render('show', { title: post.title, post, comments });
  assert(guest.includes('Đăng nhập để phản hồi'));
  assert(!guest.includes('id="forum-reply-body"'));
  const owner = await render('show', { title: post.title, post, comments, currentUser: { id: post.user_id, name: post.author_name, role: 'user' } });
  assert(owner.includes('id="forum-reply-body"'));
  assert(owner.includes(`/forum/${post.id}/delete`));
  const member = await render('show', { title: post.title, post, comments, currentUser: { id: 99, name: 'Thành viên', role: 'user' } });
  assert(!member.includes(`/forum/${post.id}/delete`));
  memory.exec('DELETE FROM comments; DELETE FROM posts;');
  const clean = getForumFeed(db);
  assert.equal(clean.total, 0);
  assert.equal(clean.counts.unanswered, 0);
  await render('index', { title: 'Diễn đàn', ...clean });
  memory.close();
  console.log('Forum checks passed: filters, sorting, pagination, counts, escaping, empty states and signed-in/guest/owner views.');
})().catch(error => { console.error(error); process.exitCode = 1; });
