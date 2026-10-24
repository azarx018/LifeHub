import test from 'node:test';
import assert from 'node:assert/strict';
import { todoVisibleOn, todoDoneOn, isTodoMissed, nextDueDate, materializeRecurring, parseSubtasks, addDays } from '../www/js/core/todoRules.js';

const D0 = '2026-10-24'; // Sabtu
const mk = extra => ({ id: 'x', title: 't', date: D0, done: false, archived: false, ...extra });
const row = (t, fn) => [-1, 0, 1, 2, 3, 4, 5].map(o => fn(t, addDays(D0, o)) ? 1 : 0).join('');

test('aktif selama: hari ini saja / 3 hari / sampai selesai', () => {
  assert.equal(row(mk({}), todoVisibleOn), '0100000');
  assert.equal(row(mk({ span: 3 }), todoVisibleOn), '0111000');
  assert.equal(row(mk({ span: 0 }), todoVisibleOn), '0111111');
});

test('dicoret di hari ke-2: tampil sampai hari dicoret, selesai mulai hari itu', () => {
  const t = mk({ span: 3, done: true, doneAt: addDays(D0, 1) });
  assert.equal(row(t, todoVisibleOn), '0110000');
  assert.equal(todoDoneOn(t, D0), false);
  assert.equal(todoDoneOn(t, addDays(D0, 1)), true);
});

test('todo lama (tanpa span) tidak berubah perilakunya', () => {
  assert.equal(row(mk({ done: true, doneAt: addDays(D0, 2) }), todoVisibleOn), '0100000');
});

test('terlewat: belum selesai, masa aktif habis; berulang & sampai-selesai tidak', () => {
  const today = addDays(D0, 2);
  assert.equal(isTodoMissed(mk({}), today), true);                       // hari ini saja, sudah lewat
  assert.equal(isTodoMissed(mk({ span: 3 }), today), false);             // masih aktif
  assert.equal(isTodoMissed(mk({ span: 3 }), addDays(D0, 3)), true);     // habis
  assert.equal(isTodoMissed(mk({ span: 0 }), addDays(D0, 30)), false);   // selamanya
  assert.equal(isTodoMissed(mk({ done: true }), today), false);
  assert.equal(isTodoMissed(mk({ archived: true }), today), false);
  assert.equal(isTodoMissed(mk({ repeat: 'daily', seriesId: 's' }), today), false);
});

test('pengulangan: harian, hari kerja, mingguan', () => {
  const daily = mk({ repeat: 'daily', seriesId: 's', date: '2026-10-23' });
  assert.equal(nextDueDate(daily, '2026-10-24'), '2026-10-24');
  assert.equal(nextDueDate(daily, '2026-10-23'), null);                  // belum waktunya
  const wk = mk({ repeat: 'weekdays', seriesId: 's', date: '2026-10-23' }); // Jumat
  assert.equal(nextDueDate(wk, '2026-10-24'), null);                     // Sabtu: libur
  assert.equal(nextDueDate(wk, '2026-10-26'), '2026-10-26');             // Senin
  const weekly = mk({ repeat: 'weekly', seriesId: 's', date: '2026-10-17' }); // Sabtu
  assert.equal(nextDueDate(weekly, '2026-10-24'), '2026-10-24');
  assert.equal(nextDueDate(weekly, '2026-10-23'), null);
});

test('hari yang terlewat tidak dibuatkan satu-satu (cuma yang terbaru)', () => {
  const daily = mk({ repeat: 'daily', seriesId: 's', date: '2026-10-01' });
  let n = 0;
  const out = materializeRecurring([daily], '2026-10-24', () => 'n' + (++n));
  assert.equal(out.length, 1);
  assert.equal(out[0].date, '2026-10-24');
  assert.equal(out[0].done, false);
  assert.equal(out[0].span, 1);
});

test('materialize memakai kemunculan terbaru sebagai templat, subtugas di-reset', () => {
  const a = mk({ repeat: 'daily', seriesId: 's', date: '2026-10-22', title: 'lama' });
  const b = mk({ id: 'b', repeat: 'daily', seriesId: 's', date: '2026-10-23', title: 'baru', done: true, doneAt: '2026-10-23', subtasks: [{ t: 'a', done: true }] });
  const out = materializeRecurring([a, b], '2026-10-24', () => 'n1');
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'baru');
  assert.deepEqual(out[0].subtasks, [{ t: 'a', done: false }]);
});

test('pengulangan dihentikan bila kemunculan terbaru repeat none', () => {
  const t = mk({ repeat: 'none', seriesId: 's', date: '2026-10-20' });
  assert.equal(materializeRecurring([t], '2026-10-24', () => 'n').length, 0);
});

test('subtugas: satu baris satu item, status dipertahankan, baris kosong dibuang', () => {
  const prev = [{ t: 'beli', done: true }, { t: 'kirim', done: false }];
  assert.deepEqual(parseSubtasks('beli\n\n  kirim  \nbaru', prev),
    [{ t: 'beli', done: true }, { t: 'kirim', done: false }, { t: 'baru', done: false }]);
  assert.deepEqual(parseSubtasks('', prev), []);
});
