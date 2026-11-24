import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PanelActions,
  PanelEmpty,
  PanelField,
  PanelHint,
  PanelSection,
  PanelSwitch
} from "./PanelPrimitives";

describe("PanelSwitch", () => {
  test("рендерит подпись и состояние", () => {
    render(<PanelSwitch label="Кластеризовать" checked />);

    const input = screen.getByRole("checkbox", { name: "Кластеризовать" });
    expect(input).toBeChecked();
  });

  test("сообщает новое значение при переключении", () => {
    const onChange = jest.fn();
    render(<PanelSwitch label="Тепловая карта" checked={false} onChange={onChange} />);

    userEvent.click(screen.getByRole("checkbox", { name: "Тепловая карта" }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("не переключается в disabled-состоянии", () => {
    const onChange = jest.fn();
    render(<PanelSwitch label="Диаграммы" checked={false} disabled onChange={onChange} />);

    const input = screen.getByRole("checkbox", { name: "Диаграммы" });
    expect(input).toBeDisabled();
    userEvent.click(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("переносит подсказку в title", () => {
    render(<PanelSwitch label="По слоям" hint="Только для временных слоёв" />);

    expect(screen.getByTitle("Только для временных слоёв")).toBeInTheDocument();
  });
});

describe("PanelSection", () => {
  test("рендерит заголовок, подсказку и содержимое", () => {
    render(
      <PanelSection title="Кластеризация" hint="Сворачивает близкие точки">
        <span>содержимое</span>
      </PanelSection>
    );

    expect(screen.getByText("Кластеризация")).toBeInTheDocument();
    expect(screen.getByText("Сворачивает близкие точки")).toBeInTheDocument();
    expect(screen.getByText("содержимое")).toBeInTheDocument();
  });

  test("рендерит действия справа", () => {
    render(
      <PanelSection title="Отображение" actions={<button type="button">Сброс</button>}>
        <span>тело</span>
      </PanelSection>
    );

    expect(screen.getByRole("button", { name: "Сброс" })).toBeInTheDocument();
  });
});

describe("PanelField", () => {
  test("показывает подпись, значение и контрол", () => {
    render(
      <PanelField label="Лимит точек" value="50 000">
        <input type="range" aria-label="limit" />
      </PanelField>
    );

    expect(screen.getByText("Лимит точек")).toBeInTheDocument();
    expect(screen.getByText("50 000")).toBeInTheDocument();
    expect(screen.getByLabelText("limit")).toBeInTheDocument();
  });

  test("не выводит пустое значение", () => {
    const { container } = render(<PanelField label="Размер" value="" />);

    expect(container.querySelector(".panel-field-value")).toBeNull();
  });
});

describe("служебные элементы", () => {
  test("PanelEmpty и PanelHint выводят текст", () => {
    render(
      <>
        <PanelEmpty>Нет данных</PanelEmpty>
        <PanelHint>Выберите точку</PanelHint>
        <PanelActions>
          <button type="button">Готово</button>
        </PanelActions>
      </>
    );

    expect(screen.getByText("Нет данных")).toBeInTheDocument();
    expect(screen.getByText("Выберите точку")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Готово" })).toBeInTheDocument();
  });
});
