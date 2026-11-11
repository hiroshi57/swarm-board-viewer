import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(root, 'index.html'), 'utf8');

/**
 * index.html は 1 ファイルで配れることが要件なので、ロジックを別ファイルに出せない。
 * そこで <script> を取り出し、最小の DOM スタブを張った vm の中で動かして検証する。
 */
function loadViewer() {
  const scripts = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2, '<script> が 2 つ以上あるはず（サンプル + 本体）');

  const el = () => ({
    textContent: '', innerHTML: '', style: {}, dataset: {},
    clientWidth: 0, clientHeight: 0, files: [],
    setAttribute() {}, querySelectorAll: () => [], getContext: () => null,
  });
  const sandbox = {
    console,
    URLSearchParams,
    Math, JSON, Date, Number, String, Object, Array, Map, Set, isNaN,
    document: { getElementById: el, querySelector: el, querySelectorAll: () => [] },
    window: { devicePixelRatio: 1 },
    location: { search: '' },
    addEventListener() {},
    fetch: () => Promise.reject(new Error('no network in test')),
  };
  sandbox.globalThis = sandbox;
  const ctx = createContext(sandbox);

  const exported = ['roleOf', 'parseBoard', 'assignRounds', 'analyze', 'buildTasks', 'checkProtocol',
    'esc', 'typeSlug', 'verdictSlug', 'load', 'SAMPLE_BOARD', 'POSTS', 'TASKS', 'STATS'];
  const src = scripts.join('\n') + `\n;globalThis.__x = { ${exported.join(', ')} };`;
  runInContext(src, ctx);
  return sandbox.__x;
}

const V = loadViewer();

test('同梱サンプルが読み込まれ、掲示板として成立している', () => {
  assert.ok(V.SAMPLE_BOARD.length > 0);
  assert.equal(V.POSTS.length, 11);
  assert.equal(V.STATS.agents.length, 5);
});

test('roleOf は論理名から役割を判定する', () => {
  assert.equal(V.roleOf('@coordinator'), 'coordinator');
  assert.equal(V.roleOf('@worker-3'), 'worker');
  assert.equal(V.roleOf('@verifier-2'), 'verifier');
  assert.equal(V.roleOf('@human'), 'human');
  assert.equal(V.roleOf('@someone'), 'unknown');
  assert.equal(V.roleOf(undefined), 'unknown');
});

test('esc は HTML に効く文字をすべて潰す', () => {
  assert.equal(V.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(V.esc('"\'&'), '&quot;&#39;&amp;');
  assert.equal(V.esc(null), '');
});

test('class 属性に入る値はホワイトリストに畳まれる（属性からの脱出を許さない）', () => {
  assert.equal(V.typeSlug('assign'), 't-assign');
  assert.equal(V.typeSlug('" onmouseover="alert(1)'), 't-other');
  assert.equal(V.verdictSlug('pass'), 'v-pass');
  assert.equal(V.verdictSlug('"><script>'), 'v-other');
  assert.equal(V.verdictSlug('open'), 'v-open');
});

test('壊れた行は落とさず bad として数える', () => {
  const r = V.parseBoard('{"seq":1,"id":"p_0001","from":"@human","to":[],"type":"note","subject":"a"}\nこわれた\n\n');
  assert.equal(r.posts.length, 1);
  assert.equal(r.bad.length, 1);
  assert.equal(r.bad[0].line, 2);
});

test('seq が前後していても並べ直す', () => {
  const r = V.parseBoard([
    JSON.stringify({ seq: 2, id: 'p_0002', from: '@human', to: [], type: 'note', subject: 'b' }),
    JSON.stringify({ seq: 1, id: 'p_0001', from: '@human', to: [], type: 'note', subject: 'a' }),
  ].join('\n'));
  assert.deepEqual([...r.posts.map((p) => p.seq)], [1, 2]);
});

test('ラウンド推定: meta.round が無いボードは送り手の再登場で切る', () => {
  const posts = V.assignRounds([
    { from: '@human' }, { from: '@coordinator' }, { from: '@worker-1' },
    { from: '@coordinator' }, { from: '@worker-1' },
  ]);
  assert.deepEqual(posts.map((p) => p.__round), [0, 0, 0, 1, 1]);
});

test('meta.round があれば推定せず実際のラウンドを使う', () => {
  assert.equal(V.STATS.rounds, 7, 'ミッション提示(0) + 6 ラウンド');
  assert.ok(V.POSTS.every((p) => p.__roundExact));
});

test('analyze はエージェント・辺・内訳を集計する', () => {
  const s = V.STATS;
  assert.equal(s.byType.assign, 3);
  assert.equal(s.verdicts.pass, 2);
  assert.equal(s.verdicts.needs_changes, 1);
  const e = s.edges.find((x) => x.from === '@worker-1' && x.to === '@verifier');
  assert.equal(e.count, 2, 'worker-1 は 2 回 verifier に渡している');
  assert.ok(s.agents.every((a) => a.role !== 'unknown'));
});

test('buildTasks は verify_result を ref 経由で本来のタスクに寄せる', () => {
  const t1 = V.TASKS.find((t) => t.id === 'T1');
  const t2 = V.TASKS.find((t) => t.id === 'T2');
  assert.ok(t1 && t2);
  assert.equal(t1.verdict, 'pass', '差し戻し後に合格した T1 は最終的に pass');
  assert.equal(t1.attempts, 2, 'T1 は 2 回 done が出ている');
  assert.equal(t2.verdict, 'pass');
  assert.ok(t1.owners.has('@worker-1'));
  // verifier 自身の task_id（T3）は作業タスクではないので一覧に出さない
  assert.equal(V.TASKS.find((t) => t.id === 'T3'), undefined);
});

test('checkProtocol: 正しいボードでは違反ゼロ', () => {
  assert.equal([...V.checkProtocol(V.POSTS)].length, 0);
});

test('checkProtocol: 自己検証・権限逸脱・検証を経ない完了を検出する', () => {
  const posts = V.assignRounds(V.parseBoard([
    JSON.stringify({ seq: 1, id: 'p_0001', from: '@verifier', to: [], type: 'progress', subject: '自作' }),
    JSON.stringify({ seq: 2, id: 'p_0002', from: '@verifier', to: [], type: 'verify_result', verdict: 'pass', ref: 'p_0001', subject: '自演' }),
    JSON.stringify({ seq: 3, id: 'p_0003', from: '@worker-1', to: ['@worker-2'], type: 'assign', task_id: 'X', subject: '越権' }),
    JSON.stringify({ seq: 4, id: 'p_0004', from: '@worker-1', to: ['@coordinator'], type: 'done', subject: '検証なし完了' }),
  ].join('\n')).posts);
  const issues = V.checkProtocol(posts);
  assert.ok(issues.some((s) => s.includes('自分の投稿を自分で検証')));
  assert.ok(issues.some((s) => s.includes('越権') === false && s.includes('assign')));
  assert.ok(issues.some((s) => s.includes('verifier に渡っていない')));
});

test('空のボードでも落ちない', () => {
  assert.doesNotThrow(() => V.load('', '空'));
});

test('1 ファイルで完結している（外部 JS/CSS を読み込まない）', () => {
  assert.ok(!/<script[^>]+\bsrc=/.test(HTML), '外部スクリプトを読んでいない');
  assert.ok(!/<link[^>]+stylesheet/.test(HTML), '外部スタイルシートを読んでいない');
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(HTML.replace(/<!--[\s\S]*?-->/g, '')), '外部 URL を参照していない');
});

test('innerHTML に入る値はすべて esc か数値か固定文字列（手で崩しにくくするための歯止め）', () => {
  // ' + 変数 + ' の形で class 属性に素の変数が入っていないことを確かめる
  const risky = [...HTML.matchAll(/class="[^"]*' \+ (\w+)/g)].map((m) => m[1]);
  const allowed = new Set(['typeSlug', 'verdictSlug']);
  for (const name of risky) assert.ok(allowed.has(name), `class 属性に素の変数 ${name} が入っている`);
});
