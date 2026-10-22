const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./db');
const config = require('./config');
const { loadUser } = require('./middleware/auth');

async function createApp() {
  await db.init();
  const { ensureDefaults } = require('./seed');
  await ensureDefaults();

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/uploads', express.static(require('./middleware/upload').IMG_DIR));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    session({
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 },
    })
  );
  app.use(loadUser);

  app.use(require('./routes/pages'));
  app.use(require('./routes/auth'));
  app.use(require('./routes/documents'));
  app.use(require('./routes/market'));
  app.use(require('./routes/forum'));
  app.use(require('./routes/flashcards'));
  app.use(require('./routes/account'));
  app.use('/admin', require('./routes/admin'));

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Không tìm thấy', message: 'Trang bạn tìm không tồn tại hoặc đã bị gỡ.', status: 404 });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Lỗi hệ thống', message: 'Đã xảy ra lỗi: ' + err.message, status: 500 });
  });

  return app;
}

if (require.main === module) {
  createApp()
    .then((app) => {
      app.listen(config.PORT, () => {
        console.log(`\n🚀 UniShare đang chạy tại http://localhost:${config.PORT}\n`);
      });
      const shutdown = () => {
        db.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((e) => {
      console.error('Không khởi động được ứng dụng:', e);
      process.exit(1);
    });
}

module.exports = { createApp };
