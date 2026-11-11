# swarm-board-viewer

**AI の群れが掲示板で何をしたかを、1 ファイルの HTML で読む。**

`board.jsonl`（[Swarm Board Protocol](https://github.com/hiroshi57/swarm-board-protocol)）を開くと、
記事の `/swarm` と同じ 3 ペイン構成で中身が見える。

```
┌──────────┬───────────────────────────┬──────────────────┐
│ タスク    │ 掲示板                     │ 関係図 + 指標     │
│ T1 合格   │ ラウンド 1                 │  @coordinator    │
│ T2 合格   │ p_0002 @coordinator →     │   ↙    ↓    ↘    │
│          │   @worker-1 [assign]      │  w-1  w-2  …     │
│          │ ...                       │   ↘    ↓    ↙    │
│          │ p_0007 @verifier →        │   @verifier      │
│          │   [needs_changes]         │  一発合格率 67%   │
└──────────┴───────────────────────────┴──────────────────┘
```

## 使う

`index.html` をブラウザで開くだけ。ビルドもサーバーも要らない。

- 何もしなければ**同梱サンプル**（swarm-board-core の mock デモ出力）が表示される
- `board.jsonl` を**ドラッグ&ドロップ**すれば差し替わる
- `index.html?board=/runs/xxx/board.jsonl` で直接指定もできる

依存パッケージゼロ、外部 CDN ゼロ、ネットワーク通信ゼロ。
**社外に出せないボードでも、ファイルを手元で開くだけで読める。**

## 見えるもの

| ペイン | 中身 |
|--------|------|
| 左: タスク | `assign` を起点にタスクを組み立て、`verify_result` で合否を付ける。何回差し戻されたかも出る |
| 中央: 掲示板 | 全投稿をラウンド区切りで時系列表示。タスクを選ぶと関係する投稿だけが浮かぶ |
| 右: 関係図 | 誰が誰に何回渡したかを力学配置で描く。coordinator / worker / verifier が縦の層になる |
| 右: 指標 | エージェント数・ラウンド数・コスト・所要時間・**一発合格率**・投稿の内訳 |

### 一発合格率を見る理由

`verify_result` のうち `pass` の割合。これが **100% なら受入基準が緩すぎる**可能性が高い。
verifier が一度も差し戻していない群れは、検証役を置いた意味がほとんどない。

逆に 50% を下回るなら、タスク分解か `assign` に書いた完了基準の書き方に問題がある。

### プロトコル健全性

ビューア側でも最小限の不変条件を見る。検証器が手元になくても、

- `verify_result` を verifier 以外が出していないか
- **自分の投稿を自分で合格にしていないか**
- worker の `done` が verifier を経由しているか
- `seq` が連番か

を開いた瞬間に判定して、違反があれば赤く出す。

## ラウンドの扱い

`swarm-board-core` は各投稿の `meta.round` に実際のラウンドを書く。あればそれを使う。
無いボード（他のツールが作ったもの）は「同じ送り手が再登場したら次のラウンド」で推定し、
見出しに「（推定）」と付ける。**推定値を確定値のように見せない。**

## 安全について

読み込むボードは信用しない。

- 表示はすべて HTML エスケープを通す
- `class` 属性に入る値（`type` / `verdict`）は**ホワイトリストの slug に畳んでから**入れる。
  未知の値は `t-other` / `v-other` になるので、属性から抜け出すことができない
- 外部へのリクエストは `?board=<url>` を明示したときだけ

これらはテストで固定してある。

## 開発

```bash
node --test "test/*.test.mjs"   # 15 件
node tools/embed-sample.mjs     # sample-board.jsonl を index.html に埋め直す
```

テストは `index.html` から `<script>` を抜き出し、最小の DOM スタブを張った `node:vm` の中で
動かして検証している。1 ファイルで配れる要件を崩さずにロジックを固定するための方法。

## 関連リポジトリ

| リポジトリ | 役割 |
|-----------|------|
| [swarm-board-protocol](https://github.com/hiroshi57/swarm-board-protocol) | 掲示板の仕様と検証器 |
| [swarm-board-core](https://github.com/hiroshi57/swarm-board-core) | ランナー |
| `swarm-board-viewer` | **（これ）** ビューア |
| [swarm-cost-governor](https://github.com/hiroshi57/swarm-cost-governor) | 台数 × トークンの予算ガード |
| [swarm-usecase-100](https://github.com/hiroshi57/swarm-usecase-100) | 100 ユースケースと実現可能性の評価 |

## ライセンス

MIT
