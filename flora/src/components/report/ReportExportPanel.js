import React, { useMemo, useState } from "react";
import {
  formatPointCount,
  formatSpeciesCount
} from "../featurePropertyLabels";
import { ModuleHelpButton, ModuleHelpPanel } from "../ModuleHelp";
import { MODULE_IDS } from "../ModuleMenu";
import { buildReportPayload } from "./buildReportPayload";
import {
  collectReportPoints,
  isReportSourceAvailable,
  resolveSpatialToolSummary
} from "./collectReportPoints";
import { downloadReportFile } from "./downloadReportFile";
import {
  REPORT_FORMAT_OPTIONS,
  REPORT_FORMATS,
  REPORT_SOURCE_OPTIONS,
  REPORT_SOURCES
} from "./reportSources";
import "../../styles/ReportExportPanel.css";

function getPreviewSummary(sourceId, context) {
  const points = collectReportPoints(sourceId, context);
  const speciesKeys = new Set();

  points.forEach((feature) => {
    const key =
      feature.properties?.species_id || feature.properties?.name_latin;

    if (key) {
      speciesKeys.add(key);
    }
  });

  return {
    pointCount: points.length,
    speciesCount: speciesKeys.size
  };
}

/** Панель формирования и скачивания отчёта по точкам. */
export default function ReportExportPanel({
  reportContext,
  collapsed = false,
  onCollapsedChange
}) {
  const [sourceId, setSourceId] = useState(REPORT_SOURCES.VISIBLE_FILTERED);
  const [format, setFormat] = useState(REPORT_FORMATS.CSV);
  const [helpOpen, setHelpOpen] = useState(false);

  const enrichedContext = useMemo(() => {
    const spatialSummary = resolveSpatialToolSummary(reportContext);

    return {
      ...reportContext,
      spatialToolLabel: spatialSummary?.sourceLabel ?? null
    };
  }, [reportContext]);

  const preview = useMemo(
    () => getPreviewSummary(sourceId, enrichedContext),
    [sourceId, enrichedContext]
  );

  const canDownload = preview.pointCount > 0;

  const handleDownload = () => {
    if (!canDownload) {
      return;
    }

    const points = collectReportPoints(sourceId, enrichedContext);
    const payload = buildReportPayload(sourceId, points, enrichedContext);

    if (sourceId === REPORT_SOURCES.SPATIAL_TOOL && enrichedContext.spatialToolLabel) {
      payload.meta.sourceLabel = enrichedContext.spatialToolLabel;
    }

    downloadReportFile(payload, format);
  };

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  return (
    <div
      className={`feature-popup report-export-panel ${collapsed ? "feature-popup--collapsed" : ""}`}
    >
      <div className="feature-popup-header">
        <h3 className="feature-popup-title">Отчёт</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
          {onCollapsedChange && (
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-expanded={!collapsed}
              title={toggleLabel}
            >
              {toggleLabel}
            </button>
          )}
        </div>
      </div>

      {helpOpen && (
        <ModuleHelpPanel sectionId={MODULE_IDS.REPORT} open={helpOpen} />
      )}

      {collapsed ? (
        <p className="popup-collapsed-summary">
          {canDownload
            ? `${formatPointCount(preview.pointCount)}, ${formatSpeciesCount(preview.speciesCount)}`
            : "Нет точек для отчёта"}
        </p>
      ) : (
        <div className="popup-content report-export-content">
          <fieldset className="report-export-fieldset">
            <legend className="report-export-legend">Источник точек</legend>
            <div className="report-export-options">
              {REPORT_SOURCE_OPTIONS.map((option) => {
                const available = isReportSourceAvailable(option.id, enrichedContext);
                const inputId = `report-source-${option.id}`;

                return (
                  <label
                    key={option.id}
                    className={`report-export-option${available ? "" : " report-export-option--disabled"}`}
                    title={available ? option.description : "Источник сейчас недоступен"}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name="report-source"
                      value={option.id}
                      checked={sourceId === option.id}
                      disabled={!available}
                      onChange={() => setSourceId(option.id)}
                    />
                    <span className="report-export-option-text">
                      <span className="report-export-option-label">{option.label}</span>
                      <span className="report-export-option-description">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <p className="report-export-summary">
            {canDownload ? (
              <>
                {formatPointCount(preview.pointCount)}, {formatSpeciesCount(preview.speciesCount)}
              </>
            ) : (
              "Нет точек для отчёта"
            )}
          </p>

          <fieldset className="report-export-fieldset">
            <legend className="report-export-legend">Формат файла</legend>
            <div className="report-export-format-options">
              {REPORT_FORMAT_OPTIONS.map((option) => {
                const inputId = `report-format-${option.id}`;

                return (
                  <label key={option.id} className="report-export-format-option" htmlFor={inputId}>
                    <input
                      id={inputId}
                      type="radio"
                      name="report-format"
                      value={option.id}
                      checked={format === option.id}
                      onChange={() => setFormat(option.id)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            className="report-export-download-btn"
            disabled={!canDownload}
            onClick={handleDownload}
          >
            Скачать
          </button>
        </div>
      )}
    </div>
  );
}
