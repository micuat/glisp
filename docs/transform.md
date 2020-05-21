# トランスフォームについて

## 従来の固定的な UI

![](./transform_uis.png)

どのソフトにも、ある要素のトランスフォーム（配置）を設定する UI があります。多少の違いはあれ、どのソフトもおおよそ **translate（平行移動）**、**rotate（回転）**、**scale（スケール）** の順に変形が適用されるようになっています。それぞれの変形を表す行列を $T$、$R$、$S$ とし、最終的な変形行列を $M$ とすると、

$$
M = T R S
$$

のようになるということです。

AfterEffects の場合、アンカーポイントという設定項目が加わります。ただやっていること自体は簡単で、まずアンカーポイントが原点に来るよう逆方向に移動し、3 つの変形を順に適用した後、アンカーポイントの位置分だけ戻してあげるだけです。こうすることで、好きな点を基準に回転・スケールをさせることができます。

$$
M = P^{-1}  (T R S) P
$$

Houdini の場合は $T$・$R$・$S$ の適用順を自由に並べ替えることが出来ます。

![](./transform_houdini.png)

## スタック式トランスフォーム

このように、トランスフォーム一つとっても様々な操作のしかたがあり、それを固定的な UI で表現しようとするとどうしても煩雑になります。3D の場合、さらに回転軸の順序も加わるので、もうシッチャカメッチャカです。

だから、僕が思うベストなトランスフォーム UI は、それぞれの変形操作を好きな順に、いくつでも並べていける構造です。これをスタック式と呼ぶことにします。

```cljs
(transform
 (mat2d/* (translate [50 10])
          (rotate (deg 45))
          (scale [1 1.5]))
 (guide/axis))
```

`translate`、`scale`、`rotate` は行列を返すただの関数です。それを `mat2d/*` で文字通り乗算してあげることでトランスフォーム値を得ています。（Lisp では関数名をスラッシュ`/`で区切ることで名前空間を表現します。`mat2d/*` は、2 次元のアフィン行列の操作をまとめた `mat2d` という名前空間の中の、行列の乗算をする `*` という一文字の関数名です）これはちょうど [CSS Transform プロパティ](https://developer.mozilla.org/ja/docs/Web/CSS/transform)と同じような方法です。ですから、せん断や X 軸方向だけの平行移動を表したければ、CSS に倣って`skew` や `translate-x` 関数を定義してあげるまでのことです。

AfterEffects のアンカーポイントを用いたトランスフォームは以下のように表現できます。

```cljs
;; 四角形の中心(20, 20)を軸に
;; 回転、スケールが適用される
(transform
 (mat2d/* (pivot [20 20]
                 (translate [0 0])
                 (rotate (deg 60))
                 (scale [1 1.5])))
 (style (fill "crimson")
  (rect [0 0] [40 40])))
```

`pivot`という関数が登場していますが、上記のコードの`pivot`部分は以下と同じことです。

```clojure
(mat2d/* (translate [-20 -20]) ;; アンカーポイントを原点へ
         (mat2d/*  (translate [0 0])
                   (rotate (deg 60))
                   (scale [1 1.5]))
         (translate [20 20])) ;; 元に戻す
```

モーショングラフィックスの制作では、一つの図形を動かして回転させてさらにそこから動かして…といった、そのレイヤーのトランスフォームだけでは表現しきれない動かし方をするためにいくつものヌルを入れ子にすることがあります。しかしこの方法だと余計な親子関係を作らずとも、一つのトランスフォーム UI だけでそうした操作を表現することができます。

ここまでに登場した `translate` も `mat2d/*` も、行列を返すただの関数でしかないので、オブジェクトのトランスフォームに限らず、例えばパスの頂点に対する変形操作も全く同じ方法と柔軟さで表現することが出来ます。

```cljs
(style (stroke "orange" 4)

 ;; path/transformは描画コンテクストではなく
 ;; パスデータ自体にトランスフォームを適用するので
 ;; スケールさせてもストロークが潰れない
 (path/transform
  (mat2d/* (translate [30 30])
           (rotate (deg 20))
           (scale [1 2]))

  (rect [0 0] [20 20])))
```

## コンストレイント機能

これまであげた基本的な変形操作の他に、「パスに沿わせる」「ある点を向く」といったものもあります。こうした操作は、コンストレイント（拘束）機能として実装されていることが多いですが、どのソフトもトランスフォーム UI と統合するのに苦労しているようです。

![](./transform_constraints.png)

スタック式だと、これまでと同様、新しい行列 `path/align-at` や `mat2d/look-at` を定義するだけ事足ります。

```cljs
;; (def a b) で、 var a = b; のように変数を宣言
(def circle-path (circle [50 50] 36))

;; def文自体もまた代入された値を返すため、
;; :start-sketchで、
;; それ以降の文のみスケッチに反映させるようにする
:start-sketch

(style (stroke "skyblue")
 circle-path)

(transform
 ;; circle-pathの始点から40%の位置に沿わせるトランスフォーム値を設定
 (path/align-at 0.4 circle-path)

 (style (fill "crimson")
  (ngon [0 0] 10 3)))
```