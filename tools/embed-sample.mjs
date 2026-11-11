#!/usr/bin/env node
// sample-board.jsonl を index.html に埋め込み直す。
// 1 ファイルで配れる状態を保つための唯一のビルド手順。
import { readFileSync, writeFileSync } from 'node:fs';

const BEGIN = '<!-- SAMPLE:BEGIN -->';
const END = '<!-- SAMPLE:END -->';

const html = readFileSync('index.html', 'utf8');
const board = readFileSync('sample-board.jsonl', 'utf8');
const block = `${BEGIN}\n<script>\n// 同梱サンプル: swarm-board-core の mock デモ出力。tools/embed-sample.mjs が生成する。\nconst SAMPLE_BOARD = ${JSON.stringify(board)};\n</script>\n${END}`;

const i = html.indexOf(BEGIN), j = html.indexOf(END);
if (i < 0 || j < 0) {
  console.error(`index.html に ${BEGIN} / ${END} のマーカーがありません`);
  process.exit(1);
}
writeFileSync('index.html', html.slice(0, i) + block + html.slice(j + END.length), 'utf8');
console.log(`埋め込みました: ${board.split('\n').filter(Boolean).length} 投稿`);
