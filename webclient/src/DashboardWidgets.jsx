import styles from './DashboardWidgets.module.css';
import {
  DASHBOARD_FRAME_WIDTH_QUARTERS,
  DASHBOARD_FRAME_HEIGHT_QUARTERS,
} from '../../constraints.js';

export function Label01({widget, latestDatapoint, editing, onWidgetClick, preview, isSelected}){
  const value = widget.previewValue ?? latestDatapoint?.[widget.columnName];
  //if(value === undefined) return null;

  return (
    <div
      className={`${styles.dashboardReading} ${isSelected ? styles.dashboardReadingSelected : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        if(editing && onWidgetClick) onWidgetClick(widget);
      }}
      style={{
        left: preview ? 0 : `${widget.xpos_quarters / DASHBOARD_FRAME_WIDTH_QUARTERS * 100}%`,
        top: preview ? 0 : `${widget.ypos_quarters / DASHBOARD_FRAME_HEIGHT_QUARTERS * 100}%`,
        width: preview ? '100%' : `${widget.width_quarters / DASHBOARD_FRAME_WIDTH_QUARTERS * 100}%`,
        height: preview ? '78px' : `${widget.height_quarters / DASHBOARD_FRAME_HEIGHT_QUARTERS * 100}%`,
      }}
    >
      <span className={styles.dashboardLabel}>{widget.columnName}</span>
      <span className={styles.dashboardValue}>{value ?? '-'}</span>
    </div>
  );
}

export default function DashboardWidgets({widgets, latestDatapoint, editing, onWidgetClick, preview}){
  if(!(widgets instanceof Array)) return null;

  return widgets.map((widget) => {
    if(!(widget instanceof Object)) return null;

    let renderedWidget;
    switch(widget.widgetType){
      case 0:
        renderedWidget = <Label01
          widget={widget}
          latestDatapoint={latestDatapoint}
          editing={editing}
          onWidgetClick={onWidgetClick}
          preview={preview}
        />;
        break;
      default:
        renderedWidget = null;
    }

    return <span key={widget.widgetId}>{renderedWidget}</span>;
  });
}
