const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function loadParser() {
  const file = path.resolve(__dirname, '../scripts/fetch-events.js');
  const source = fs.readFileSync(file, 'utf8');
  const marker = '\n(async () => {';
  const runtime = source.slice(0, source.indexOf(marker));
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(`${runtime}\nmodule.exports = { reserve, parse, sources };`, file);
  return loaded.exports;
}

const { reserve, parse, sources } = loadParser();
const ctx = { y: 2026, m: 10, url: 'https://example.test/schedule' };

test('reserve parses the current Blue Note and Cotton Club list cards', () => {
  const html = `
    <div class="m-schedule-list__row">
      <div class="m-schedule-list__date-items">
        <span class="m-schedule-list__date-num">09</span>
        <span class="m-schedule-list__date-num">10</span>
      </div>
      <a href="https://reserve.bluenote.co.jp/reserve/schedule/exec/3960" class="c-schedule-list-card">
        <img src="/reserve/img/event/3960.jpg">
        <p class="c-schedule-list-card__title">ANOUSHKA SHANKAR</p>
        <span class="c-schedule-list-card__charge-price">¥16,500</span>
      </a>
    </div>`;
  const rows = reserve(html, ctx, 'https://reserve.bluenote.co.jp');
  assert.deepEqual(rows.map(row => [row.date, row.artist]), [
    ['2026-10-09', 'ANOUSHKA SHANKAR'],
    ['2026-10-10', 'ANOUSHKA SHANKAR']
  ]);
  assert.equal(rows[0].price, '¥16,500');
});

test('Billboard parser ignores serialized field order', () => {
  const html = String.raw`<script>self.__next_f.push([1,"{\"block_settings\":[{\"price_name\":\"S指定席\",\"price\":8800}],\"play_open\":\"17:00\",\"images\":[{\"image_name\":\"dtl_ev-123_1.jpg\"}],\"play_start\":\"18:00\",\"play_date\":\"2026-10-16\",\"title_name\":\"TEST ARTIST\",\"event_id\":\"ev-123\",\"holiday\":false,\"result_status\":\"allOK\"}"])</script>`;
  const rows = parse('billboard_yokohama', html, ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].artist, 'TEST ARTIST');
  assert.equal(rows[0].price, '8,800円〜');
  assert.equal(rows[0].source, 'https://www.billboard-live.com/yokohama/show?event_id=ev-123&date=2026-10-16');
});

test('Kings Bar uses the working month query and parses current schedule cards', () => {
  assert.deepEqual(sources.kingsbar(2026, 10), ['https://livebar.net/kingsbar/schedule?month=2026-10']);
  const html = `
    <h2>2026年10月</h2>
    <div onclick="window.location='https://livebar.net/kingsbar/events/4097'">
      <p>10月</p><p>06</p><p>火</p>
      <h3>JAZZ限定ノーLIVEデー/ボーカルセッションDAY</h3>
      <p>15:00 OPEN · 2時間2200円飲み放題</p>
    </div>`;
  const rows = parse('kingsbar', html, ctx);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-06');
  assert.equal(rows[0].artist, 'JAZZ限定ノーLIVEデー/ボーカルセッションDAY');
  assert.equal(rows[0].open, '15:00');
});

test('browser fallback uses the working Kings Bar URL and marks Body and Soul closed', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  assert.match(html, /livebar\.net\/kingsbar\/schedule\?month=\$\{y\}-\$\{pad\(m\)\}/);
  assert.match(html, /id:'bodyandsoul'.*status:'2026年9月営業終了'/);
});

test('VENUS official image transcription covers October and November', () => {
  const rows = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/venus-image-events.json'), 'utf8'));
  assert.equal(rows.filter(row => row.date.startsWith('2026-10')).length, 30);
  assert.equal(rows.filter(row => row.date.startsWith('2026-11')).length, 25);
  assert.ok(rows.every(row => row.artist && /^2026-(10|11)-\d{2}$/.test(row.date)));
});
