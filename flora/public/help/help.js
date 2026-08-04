const HELP_SECTION_LABELS = {
  feature: "Сведения о точке",
  areal: "Радиус",
  polygon: "Полигон",
  buffer: "Буфер",
  area: "Область",
  year: "Год находки",
  status: "Статус МСОП",
  map: "Группы точек",
  oopt: "ООПТ",
  "oopt-feature": "Сведения об ООПТ",
  submit: "Ввод данных о находке"
};

const HELP_SECTION_IDS = Object.keys(HELP_SECTION_LABELS);

const LIST_LINE_PATTERN = /^([*\-+])\s+(.*)$/;
const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/;

let markdownBaseUrl = null;

function getRequestedSection() {
  const params = new URLSearchParams(window.location.search);
  return params.get("section") || HELP_SECTION_IDS[0];
}

function getMapUrl() {
  return new URL("../", window.location.href).pathname;
}

function extractMarkdownSection(markdown, sectionId) {
  if (!markdown || !sectionId) {
    return "";
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const sectionPattern = new RegExp(`^##\\s+${sectionId}\\s*$`, "m");
  const match = normalized.match(sectionPattern);

  if (!match || match.index === undefined) {
    return "";
  }

  const sectionStart = match.index + match[0].length;
  const rest = normalized.slice(sectionStart);
  const nextSectionMatch = rest.match(/^##\s+/m);
  const sectionBody = nextSectionMatch ? rest.slice(0, nextSectionMatch.index) : rest;

  return sectionBody.trim();
}

function parseSections(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const matches = [...normalized.matchAll(/^##\s+(\S+)\s*$/gm)];
  return matches.map((match) => match[1]);
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        return strong;
      }

      return document.createTextNode(part);
    })
    .filter(Boolean);
}

function appendInline(parent, text) {
  renderInline(text).forEach((node) => parent.appendChild(node));
}

function isListLine(line) {
  return LIST_LINE_PATTERN.test(line.trim());
}

function getListItemText(line) {
  const match = line.trim().match(LIST_LINE_PATTERN);
  return match ? match[2].trim() : line.trim();
}

function resolveImageSrc(src) {
  if (!markdownBaseUrl || /^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src)) {
    return src;
  }

  return new URL(src, markdownBaseUrl).href;
}

function renderImageBlock(firstLine) {
  const match = firstLine.trim().match(IMAGE_LINE_PATTERN);

  if (!match) {
    return null;
  }

  const figure = document.createElement("figure");
  figure.className = "help-image";
  const img = document.createElement("img");
  img.src = resolveImageSrc(match[2].trim());
  img.alt = match[1];
  figure.appendChild(img);
  return figure;
}

function renderBlock(block) {
  const lines = block.split("\n");
  const firstLine = lines[0];
  const fragment = document.createDocumentFragment();
  const imageBlock = renderImageBlock(firstLine);

  if (imageBlock) {
    fragment.appendChild(imageBlock);
    return fragment;
  }

  if (firstLine.startsWith("### ")) {
    const heading = document.createElement("h3");
    appendInline(heading, firstLine.slice(4).trim());
    fragment.appendChild(heading);
    return fragment;
  }

  if (firstLine.startsWith("## ")) {
    const heading = document.createElement("h2");
    appendInline(heading, firstLine.slice(3).trim());
    fragment.appendChild(heading);
    return fragment;
  }

  if (firstLine.startsWith("# ")) {
    const heading = document.createElement("h1");
    appendInline(heading, firstLine.slice(2).trim());
    fragment.appendChild(heading);
    return fragment;
  }

  if (!lines.some(isListLine)) {
    const paragraph = document.createElement("p");
    appendInline(paragraph, lines.join(" "));
    fragment.appendChild(paragraph);
    return fragment;
  }

  let paragraphLines = [];
  let listItems = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const paragraph = document.createElement("p");
    appendInline(paragraph, paragraphLines.join(" "));
    fragment.appendChild(paragraph);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    const list = document.createElement("ul");
    listItems.forEach((item) => {
      const listItem = document.createElement("li");
      appendInline(listItem, item);
      list.appendChild(listItem);
    });
    fragment.appendChild(list);
    listItems = [];
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

  return fragment;
}

function renderMarkdown(markdown) {
  const container = document.createDocumentFragment();
  const blocks = markdown.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);

  blocks.forEach((block) => {
    container.appendChild(renderBlock(block));
  });

  return container;
}

function buildNav(sections, activeSection) {
  const navList = document.getElementById("help-nav-list");
  navList.textContent = "";

  sections.forEach((sectionId) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `index.html?section=${encodeURIComponent(sectionId)}`;
    link.textContent = HELP_SECTION_LABELS[sectionId] || sectionId;

    if (sectionId === activeSection) {
      link.classList.add("help-nav-link--active");
      link.setAttribute("aria-current", "page");
    }

    item.appendChild(link);
    navList.appendChild(item);
  });
}

function showSection(sectionId, markdown, sections) {
  const label = HELP_SECTION_LABELS[sectionId] || sectionId;
  document.title = `${label} — Как это работает`;

  const body = extractMarkdownSection(markdown, sectionId);
  const content = document.getElementById("help-content");
  content.textContent = "";

  if (!body) {
    const empty = document.createElement("p");
    empty.className = "help-empty";
    empty.textContent = "Раздел справки для этого модуля пока не заполнен.";
    content.appendChild(empty);
  } else {
    content.appendChild(renderMarkdown(body));
  }

  buildNav(sections, sectionId);
  content.hidden = false;
}

function showError() {
  document.getElementById("help-loading").hidden = true;
  document.getElementById("help-error").hidden = false;
}

async function initHelpPage() {
  const backLink = document.getElementById("help-back-link");
  backLink.href = getMapUrl();

  const sectionId = getRequestedSection();
  const markdownUrl = new URL("../docs/moduleHelp-full.md", window.location.href);
  markdownBaseUrl = new URL("../docs/", window.location.href);

  try {
    const response = await fetch(markdownUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Failed to load help markdown");
    }

    const markdown = await response.text();
    const sections = parseSections(markdown);
    const activeSection = sections.includes(sectionId) ? sectionId : sections[0];

    if (sectionId !== activeSection) {
      const params = new URLSearchParams(window.location.search);
      params.set("section", activeSection);
      window.history.replaceState({}, "", `index.html?${params.toString()}`);
    }

    document.getElementById("help-loading").hidden = true;
    showSection(activeSection, markdown, sections);
  } catch {
    showError();
  }
}

initHelpPage();
