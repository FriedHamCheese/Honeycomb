import styles from './DashboardWidgets.module.css';
import {
  DASHBOARD_FRAME_WIDTH_QUARTERS,
  DASHBOARD_FRAME_HEIGHT_QUARTERS,
} from '../../constraints.js';

function Label01({widget, latestDatapoint, editing, onWidgetClick}){
  const value = latestDatapoint?.[widget.columnName];
  //if(value === undefined) return null;

  return (
    <div
      className={styles.dashboardReading}
      onClick={(event) => {
        event.stopPropagation();
        if(editing) onWidgetClick(widget);
      }}
      style={{
        left: `${widget.xpos_quarters / DASHBOARD_FRAME_WIDTH_QUARTERS * 100}%`,
        top: `${widget.ypos_quarters / DASHBOARD_FRAME_HEIGHT_QUARTERS * 100}%`,
        width: `${widget.width_quarters / DASHBOARD_FRAME_WIDTH_QUARTERS * 100}%`,
        height: `${widget.height_quarters / DASHBOARD_FRAME_HEIGHT_QUARTERS * 100}%`,
      }}
    >
      <span className={styles.dashboardLabel}>{widget.columnName}</span>
      <span className={styles.dashboardValue}>{value ?? '-'}</span>
    </div>
  );
}

export default function DashboardWidgets({widgets, latestDatapoint, editing, onWidgetClick}){
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
        />;
        break;
      default:
        renderedWidget = null;
    }

    return <span key={widget.widgetId}>{renderedWidget}</span>;
  });
}
