import type { Element, Root, Text } from 'hast';
import { visit } from 'unist-util-visit';

/** @имя (как в usernameSchema) или @everyone */
const MENTION_RE = /@([\p{L}\p{N}_.-]{2,24}|everyone)/gu;

/**
 * Подсветка упоминаний: оборачивает @имя в <span class="mention">.
 * Работает по hast-дереву ПОСЛЕ markdown-парсинга, поэтому код и
 * блоки кода не трогает (их содержимое — внутри <code>).
 */
export function rehypeMentions() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return undefined;
      if (parent.type === 'element' && (parent.tagName === 'code' || parent.tagName === 'a')) {
        return undefined;
      }

      MENTION_RE.lastIndex = 0;
      if (!MENTION_RE.test(node.value)) return undefined;

      const parts: (Element | Text)[] = [];
      let last = 0;
      MENTION_RE.lastIndex = 0;
      for (const match of node.value.matchAll(MENTION_RE)) {
        if (match.index > last) {
          parts.push({ type: 'text', value: node.value.slice(last, match.index) });
        }
        parts.push({
          type: 'element',
          tagName: 'span',
          properties: { className: ['mention'] },
          children: [{ type: 'text', value: match[0] }],
        });
        last = match.index + match[0].length;
      }
      if (last < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(last) });
      }

      parent.children.splice(index, 1, ...parts);
      // продолжить обход после вставленных узлов
      return index + parts.length;
    });
  };
}
