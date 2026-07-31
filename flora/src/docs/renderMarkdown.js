import React from "react";

const LIST_LINE_PATTERN = /^([*\-+])\s+(.*)$/;

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
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

  if (/^(-{3,}|\*{3,}|_{3,})$/.test(firstLine.trim()) && lines.length === 1) {
    return <hr key={blockIndex} />;
  }

  if (!lines.some(isListLine)) {
    return <p key={blockIndex}>{renderInline(lines.join(" "))}</p>;
  }

  const elements = [];
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

  return <React.Fragment key={blockIndex}>{elements}</React.Fragment>;
}

export function renderMarkdown(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const blocks = normalized.trim().split(/\n{2,}/);

  return blocks.map((block, index) => renderBlock(block, index));
}
