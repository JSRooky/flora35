import React, { useEffect, useMemo, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "../ModuleHelp";
import { MODULE_IDS } from "../ModuleMenu";
import PanelCloseButton from "../PanelCloseButton";
import PanelHint from "../PanelHint";
import PanelMinimizeButton from "../PanelMinimizeButton";
import {
  collectReportPoints,
  isReportSourceAvailable,
  resolveSpatialToolSummary
} from "../report/collectReportPoints";
import {
  REPORT_SOURCE_OPTIONS,
  REPORT_SOURCES
} from "../report/reportSources";
import {
  ANALYSIS_METHOD_OPTIONS,
  ANALYSIS_METHODS,
  runAnalysis
} from "../../dataWork/analysis/runAnalysis";
import {
  DEFAULT_QUALITY_FILTER,
  QUALITY_FILTER_OPTIONS
} from "../../dataWork/analysis/qualityFilter";
import { KDE_BANDWIDTH_SCALES } from "../../dataWork/analysis/kde";
import AnalysisChart from "./AnalysisChart";
import AnalysisKdeHeatmap from "./AnalysisKdeHeatmap";
import "../../styles/AnalysisPanel.css";

const TREND_LABELS = {
  increase: "рост",
  decrease: "спад",
  none: "нет",
  insufficient: "мало лет"
};

function formatNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : Math.min(digits, 2)
  }).format(value);
}

function formatP(value) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  if (value < 0.001) {
    return "< 0,001";
  }
  return value.toFixed(3).replace(".", ",");
}

function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadAnalysisJson(payload) {
  const datePart = new Date().toISOString().slice(0, 10);
  const rest = { ...payload };
  delete rest.overlay;
  const blob = new Blob([JSON.stringify(rest, null, 2)], {
    type: "application/json"
  });
  triggerDownload(`flora35-analysis-${payload.method}-${datePart}.json`, blob);
}

function downloadAnalysisGeojson(collection, method) {
  if (!collection?.features?.length) {
    return;
  }
  const datePart = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(collection, null, 2)], {
    type: "application/geo+json"
  });
  triggerDownload(`flora35-analysis-${method}-${datePart}.geojson`, blob);
}

function Metric({ label, value }) {
  return (
    <div className="analysis-metric">
      <dt className="analysis-metric-label">{label}</dt>
      <dd className="analysis-metric-value">{value}</dd>
    </div>
  );
}

/** Панель статистического анализа текущей выборки карты. */
export default function AnalysisPanel({
  reportContext,
  collapsed = false,
  onCollapsedChange,
  onMinimize,
  onClose,
  onKdeOverlayChange
}) {
  const [sourceId, setSourceId] = useState(REPORT_SOURCES.VISIBLE_FILTERED);
  const [methodId, setMethodId] = useState(ANALYSIS_METHODS.EOO_AOO);
  const [quality, setQuality] = useState(DEFAULT_QUALITY_FILTER);
  const [bandwidthScale, setBandwidthScale] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);

  const enrichedContext = useMemo(() => {
    const spatialSummary = resolveSpatialToolSummary(reportContext);
    return {
      ...reportContext,
      spatialToolLabel: spatialSummary?.sourceLabel ?? null
    };
  }, [reportContext]);

  const points = useMemo(
    () => collectReportPoints(sourceId, enrichedContext),
    [sourceId, enrichedContext]
  );

  const report = useMemo(
    () => runAnalysis(methodId, points, { sourceId, quality, bandwidthScale }),
    [methodId, points, sourceId, quality, bandwidthScale]
  );

  useEffect(() => {
    if (!onKdeOverlayChange) {
      return;
    }
    if (methodId === ANALYSIS_METHODS.KDE && report.overlay?.features?.length) {
      onKdeOverlayChange(report.overlay);
      return;
    }
    onKdeOverlayChange(null);
  }, [methodId, onKdeOverlayChange, report.overlay]);

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const canRun = report.meta.pointCount > 0;
  const summary = canRun
    ? `${formatNumber(report.meta.pointCount, 0)} т. · ${formatNumber(report.meta.speciesCount, 0)} вид.`
    : "Нет точек";

  const chartSeries =
    methodId === ANALYSIS_METHODS.ACCUMULATION
      ? report.series.map((item) => ({ x: item.n, y: item.s }))
      : methodId === ANALYSIS_METHODS.YEAR_TREND
        ? report.series.map((item) => ({ x: item.year, y: item.findings }))
        : [];

  const handleQualityToggle = (id) => {
    setQuality((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <aside
      className={`analysis-panel${collapsed ? " analysis-panel--collapsed" : ""}`}
      aria-label="Анализ"
    >
      <div className="analysis-panel-header">
        <h3 className="analysis-panel-title">Анализ</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          {onCollapsedChange ? (
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-expanded={!collapsed}
              title={toggleLabel}
            >
              {toggleLabel}
            </button>
          ) : null}
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>
      </div>

      {helpOpen ? <ModuleHelpPanel sectionId={MODULE_IDS.ANALYSIS} open={helpOpen} /> : null}

      {collapsed ? (
        <p className="analysis-panel-summary">{summary}</p>
      ) : (
        <div className="analysis-panel-content">
          <PanelHint>
            Считает по той же выборке, что и «Отчёт»: текущий слой и фильтры карты. Сравнение слоёв
            не затрагивается. Методы: EOO/AOO, разрежение + Chao1, тренд по годам, KDE-плотность
            (изоплеты на карте).
          </PanelHint>

          <fieldset className="analysis-fieldset">
            <legend className="analysis-legend">Выборка</legend>
            <div className="analysis-source-options">
              {REPORT_SOURCE_OPTIONS.map((option) => {
                const available = isReportSourceAvailable(option.id, enrichedContext);
                return (
                  <label
                    key={option.id}
                    className={`analysis-source${available ? "" : " analysis-source--disabled"}`}
                    title={available ? option.description : "Источник сейчас недоступен"}
                  >
                    <input
                      type="radio"
                      name="analysis-source"
                      value={option.id}
                      checked={sourceId === option.id}
                      disabled={!available}
                      onChange={() => setSourceId(option.id)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="analysis-fieldset">
            <legend className="analysis-legend">Качество</legend>
            <div className="analysis-quality-options">
              {QUALITY_FILTER_OPTIONS.map((option) => (
                <label key={option.id} className="analysis-quality" title={option.title}>
                  <input
                    type="checkbox"
                    checked={Boolean(quality[option.id])}
                    onChange={() => handleQualityToggle(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="analysis-methods" role="tablist" aria-label="Метод анализа">
            {ANALYSIS_METHOD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={methodId === option.id}
                className={`analysis-method${methodId === option.id ? " analysis-method--active" : ""}`}
                onClick={() => setMethodId(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {methodId === ANALYSIS_METHODS.KDE ? (
            <fieldset className="analysis-fieldset">
              <legend className="analysis-legend">Ширина ядра</legend>
              <div className="analysis-bandwidth-options">
                {KDE_BANDWIDTH_SCALES.map((scale) => (
                  <label key={scale} className="analysis-quality">
                    <input
                      type="radio"
                      name="analysis-bandwidth"
                      checked={bandwidthScale === scale}
                      onChange={() => setBandwidthScale(scale)}
                    />
                    {scale === 1 ? "авто (Скотт)" : `×${String(scale).replace(".", ",")}`}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <p className="analysis-summary">
            {summary}
            {report.meta.droppedCount > 0
              ? ` · отсеяно ${formatNumber(report.meta.droppedCount, 0)}`
              : ""}
            {report.meta.singleSpecies ? ` · ${report.meta.singleSpecies}` : ""}
          </p>

          {!canRun ? (
            <p className="analysis-empty">Выберите слой данных или сузьте выборку инструментом карты.</p>
          ) : (
            <>
              {methodId === ANALYSIS_METHODS.EOO_AOO ? (
                <dl className="analysis-metrics">
                  <Metric label="Локалитетов" value={formatNumber(report.metrics.uniqueLocalities, 0)} />
                  <Metric
                    label="EOO, км²"
                    value={
                      report.metrics.eooKm2 == null
                        ? "нужно ≥3 точки"
                        : formatNumber(report.metrics.eooKm2, 1)
                    }
                  />
                  <Metric label="AOO, км²" value={formatNumber(report.metrics.aooKm2, 1)} />
                  <Metric
                    label={`Ячеек ${report.metrics.cellKm}×${report.metrics.cellKm} км`}
                    value={formatNumber(report.metrics.aooCells, 0)}
                  />
                </dl>
              ) : null}

              {methodId === ANALYSIS_METHODS.ACCUMULATION ? (
                <>
                  <dl className="analysis-metrics">
                    <Metric label="S набл." value={formatNumber(report.metrics.sObs, 0)} />
                    <Metric label="Chao1" value={formatNumber(report.metrics.chao1, 1)} />
                    <Metric
                      label="95% ДИ"
                      value={`${formatNumber(report.metrics.chao1Lower, 1)} – ${formatNumber(report.metrics.chao1Upper, 1)}`}
                    />
                    <Metric label="Покрытие" value={formatNumber(report.metrics.coverage, 3)} />
                  </dl>
                  <AnalysisChart
                    title="Разрежение: виды от числа определённых точек"
                    series={chartSeries}
                    xLabel="n"
                    yLabel="S"
                  />
                </>
              ) : null}

              {methodId === ANALYSIS_METHODS.YEAR_TREND ? (
                <>
                  <dl className="analysis-metrics">
                    <Metric label="Лет с данными" value={formatNumber(report.metrics.years, 0)} />
                    <Metric
                      label="Находки / год"
                      value={`${TREND_LABELS[report.metrics.findingsTrend] ?? "—"} (p=${formatP(report.metrics.findingsP)})`}
                    />
                    <Metric
                      label="Виды / год"
                      value={`${TREND_LABELS[report.metrics.speciesTrend] ?? "—"} (p=${formatP(report.metrics.speciesP)})`}
                    />
                    <Metric
                      label="Наклон находок"
                      value={formatNumber(report.metrics.findingsSlope, 2)}
                    />
                  </dl>
                  <AnalysisChart
                    title="Находки по годам"
                    series={chartSeries}
                    xLabel="год"
                    yLabel="n"
                  />
                  {report.metrics.withoutYear > 0 ? (
                    <p className="analysis-note">
                      Без года: {formatNumber(report.metrics.withoutYear, 0)} т. (в ряды не входят)
                    </p>
                  ) : null}
                </>
              ) : null}

              {methodId === ANALYSIS_METHODS.KDE ? (
                <>
                  <dl className="analysis-metrics">
                    <Metric
                      label="Локалитетов"
                      value={formatNumber(report.metrics.uniqueLocalities, 0)}
                    />
                    <Metric
                      label="h, км"
                      value={
                        report.metrics.bandwidthKm == null
                          ? "нужно ≥2 точки"
                          : formatNumber(report.metrics.bandwidthKm, 2)
                      }
                    />
                    <Metric
                      label="Ядро 50%, км²"
                      value={formatNumber(report.metrics.area50Km2, 0)}
                    />
                    <Metric
                      label="95% массы, км²"
                      value={formatNumber(report.metrics.area95Km2, 0)}
                    />
                  </dl>
                  <AnalysisKdeHeatmap
                    grid={report.grid}
                    title="KDE по уникальным локалитетам"
                  />
                  {report.meta.speciesCount > 1 ? (
                    <p className="analysis-note">
                      Несколько видов: пятно отражает смесь точек, не ареал одного таксона. Для ядра
                      вида сузьте выборку фильтром.
                    </p>
                  ) : null}
                  {report.metrics.binned ? (
                    <p className="analysis-note">
                      Для расчёта точки схлопнуты в ячейки 2 км ({formatNumber(report.metrics.sampledCount, 0)} узлов)
                    </p>
                  ) : null}
                </>
              ) : null}

              <p className="analysis-method-note">{report.methodology}</p>

              <div className="analysis-download-row">
                <button
                  type="button"
                  className="analysis-download-btn"
                  onClick={() => downloadAnalysisJson(report)}
                >
                  Скачать JSON
                </button>
                {methodId === ANALYSIS_METHODS.KDE && report.overlay?.features?.length ? (
                  <button
                    type="button"
                    className="analysis-download-btn analysis-download-btn--secondary"
                    onClick={() => downloadAnalysisGeojson(report.overlay, report.method)}
                  >
                    Скачать GeoJSON изоплет
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
