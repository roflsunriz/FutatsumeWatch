// DOMの代替実装はtest/setup.tsが用意する。製品は実ブラウザを参照する。
export const browser = { window, document, Node: window.Node, NodeList: window.NodeList };
