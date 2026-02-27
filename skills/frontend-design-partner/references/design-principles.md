# Design Principles Reference

## Information Architecture

- 優先順位を先に定義し、UIはその順に情報を露出する。
- 1つのセクションに1つの目的を与える。
- ナビゲーションは「現在地」「到達可能な次の行動」「戻り先」を常に示す。

## Typography

- 2書体までに制限する。
- 見出しと本文で役割差を明確にする。
- 英文学習コンテンツでは行長を長くしすぎない。

## Color System

- 役割で色を定義する: `bg`, `surface`, `text`, `muted`, `accent`, `danger`, `success`。
- アクセント色は少量運用し、主CTAに集中させる。
- 状態色は意味を固定し、ページをまたいで再利用する。

## Spacing and Rhythm

- 4pxまたは8px基準で余白スケールを固定する。
- 要素間距離は意味差を表現するために使う。
- カード内とカード間の余白を混同しない。

## Motion

- すべてのアニメーションに目的を持たせる。
- 登場は短く、退場はさらに短くする。
- 反復利用される操作では過度なモーションを避ける。

## Accessibility Baseline

- 本文コントラストを確保する。
- `:focus-visible` を必ず定義する。
- `prefers-reduced-motion: reduce` で主要モーションを無効化する。
- タップターゲットを十分なサイズにする。
