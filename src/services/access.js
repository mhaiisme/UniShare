const db = require('../db');
const { isPremium } = require('../utils');

/**
 * Xác định quyền xem đầy đủ một tài liệu.
 * reason: owner | admin | purchased | premium | unlocked | paid | free | login
 */
function getAccess(user, doc) {
  if (!user) return { full: false, reason: doc.price > 0 ? 'paid' : 'login' };
  if (user.id === doc.user_id) return { full: true, reason: 'owner' };
  if (user.role === 'admin') return { full: true, reason: 'admin' };
  if (doc.price > 0) {
    const p = db.get('SELECT id FROM purchases WHERE user_id = ? AND document_id = ?', [user.id, doc.id]);
    return p ? { full: true, reason: 'purchased' } : { full: false, reason: 'paid' };
  }
  if (isPremium(user)) return { full: true, reason: 'premium' };
  const u = db.get('SELECT id FROM unlocks WHERE user_id = ? AND document_id = ?', [user.id, doc.id]);
  return u ? { full: true, reason: 'unlocked' } : { full: false, reason: 'free' };
}

/** Tài liệu có được hiển thị cho người dùng này không (theo trạng thái). */
function canSee(user, doc) {
  if (!doc) return false;
  if (doc.status === 'approved') return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.id === doc.user_id && doc.status !== 'deleted';
}

module.exports = { getAccess, canSee };
