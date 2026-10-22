const db = require('../db');

class InsufficientFundsError extends Error {
  constructor(needed, balance) {
    super(`Số dư ví không đủ (cần ${needed.toLocaleString('vi-VN')}đ, hiện có ${balance.toLocaleString('vi-VN')}đ).`);
    this.code = 'INSUFFICIENT_FUNDS';
  }
}

function changeBalance(userId, amount, type, description) {
  const u = db.get('SELECT balance FROM users WHERE id = ?', [userId]);
  if (!u) throw new Error('Không tìm thấy người dùng');
  const after = u.balance + amount;
  if (after < 0) throw new InsufficientFundsError(-amount, u.balance);
  db.run('UPDATE users SET balance = ? WHERE id = ?', [after, userId]);
  db.run(
    'INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)',
    [userId, type, amount, after, description]
  );
  return after;
}

const credit = (userId, amount, type, desc) => changeBalance(userId, Math.abs(amount), type, desc);
const debit = (userId, amount, type, desc) => changeBalance(userId, -Math.abs(amount), type, desc);

function addRevenue(source, amount, ref) {
  if (amount > 0) db.run('INSERT INTO revenue (source, amount, ref) VALUES (?, ?, ?)', [source, amount, ref]);
}

function notify(userId, message, link = null) {
  db.run('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)', [userId, message, link]);
}

function notifyAdmins(message, link = null) {
  for (const a of db.all("SELECT id FROM users WHERE role = 'admin'")) notify(a.id, message, link);
}

module.exports = { credit, debit, addRevenue, notify, notifyAdmins, InsufficientFundsError };
