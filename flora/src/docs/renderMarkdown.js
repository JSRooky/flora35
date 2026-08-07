import React from "react";

// Пункт списка: маркер *, - или + в начале строки.
const LIST_LINE_PATTERN = /^([*\-+])\s+(.*)$/;
// Инлайн-разметка: **жирный**, *курсив* или _курсив_.
const INLINE_FORMAT_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/;
// Горизонтальная линия: строка из трёх и более -, * или _.
const HORIZONTAL_RULE_LINE_PATTERN = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;

function isHorizontalRuleLine(line) {
  return HORIZONTAL_RULE_LINE_PATTERN.test(line);
}

// Разбивает текст по разметке жирный/курсив и оборачивает найденные части в React-элементы.
function renderInline(text) {
  return text
    .split(INLINE_FORMAT_PATTERN)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      if (
        (part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))
      ) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }

      return part;
    });
}

function isListLine(line) {
  return LIST_LINE_PATTERN.test(line.trim());
}

function getListItemText(line) {
  const match = line.trim().match(LIST_LINE_PATTERN);
  return match ? match[2].trim() : line.trim();
}

// Рендерит один блок markdown (разделённый пустой строкой фрагмент) в React-элементы.
function renderBlock(block, blockIndex) {
  const lines = block.split("\n");
  const firstLine = lines[0];

  if (firstLine.startsWith("# ")) {
    return <h2 key={blockIndex}>{renderInline(firstLine.slice(2).trim())}</h2>;
  }

  if (firstLine.startsWith("## ")) {
    return <h3 key={blockIndex}>{renderInline(firstLine.slice(3).trim())}</h3>;
  }

  if (firstLine.startsWith("### ")) {
    return <h4 key={blockIndex}>{renderInline(firstLine.slice(4).trim())}</h4>;
  }

  const elements = [];
  // Строки накапливаются в буфер и превращаются в элемент только при завершении абзаца/списка
  // (переходе к другому типу строки), чтобы соседние строки объединялись в один <p>/<ul>.
  let paragraphLines = [];
  let listItems = [];
  let partIndex = 0;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    elements.push(
      <p key={`${blockIndex}-p-${partIndex}`}>
        {renderInline(paragraphLines.join(" "))}
      </p>
    );
    paragraphLines = [];
    partIndex += 1;
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    elements.push(
      <ul key={`${blockIndex}-ul-${partIndex}`}>
        {listItems.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
    partIndex += 1;
  };

  lines.forEach((line) => {
    if (isHorizontalRuleLine(line)) {
      flushParagraph();
      flushList();
      elements.push(<hr key={`${blockIndex}-hr-${partIndex}`} />);
      partIndex += 1;
      return;
    }

    if (isListLine(line)) {
      flushParagraph();
      listItems.push(getListItemText(line));
      return;
    }

    if (line.trim()) {
      flushList();
      paragraphLines.push(line.trim());
    }
  });

  flushParagraph();
  flushList();

  if (elements.length === 1) {
    return elements[0];
  }

  return <React.Fragment key={blockIndex}>{elements}</React.Fragment>;
}

/** Рендерит markdown-текст в массив React-элементов (упрощённый парсер). */
export function renderMarkdown(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const blocks = normalized.trim().split(/\n{2,}/);

  return blocks.map((block, index) => renderBlock(block, index));
}
