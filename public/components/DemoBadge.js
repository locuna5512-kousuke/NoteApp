// デモ (サンプル出力) であることを示すラベル
export function demoBadge() {
  const el = document.createElement('p');
  el.className = 'demo-badge';
  el.textContent = 'デモ表示：サンプルの出力です';
  return el;
}
