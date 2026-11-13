import styles from './DashboardWidgets.module.css';
import {
  DASHBOARD_FRAME_WIDTH_QUARTERS,
  DASHBOARD_FRAME_HEIGHT_QUARTERS,
} from '../../constraints.js';

function DashboardReading({widget, latestDatapoint}){
  const value = latestDatapoint?.[widget.columnName];
  if(value === undefined) return null;

  const unit = widget.columnName === 'temperature_celsius'
    ? ' °C'
    : widget.columnName === 'relative_humidity_percent' ? ' %' : '';

  return (
    <div
      className={styles.dashboardReading}
      style={{
        left: `${widget.xpos_quarters / DASHBOARD_FRAME_WIDTH_QUARTERS * 100}%`,
        top: `${widget.ypos_quarters / DASHBOARD_FRAME_HEIGHT_QUARTERS * 100}%`,
        width: `${widget.width_quarters / DASHBOARD_FRAME_WIDTH_QUARTERS * 100}%`,
        height: `${widget.height_quarters / DASHBOARD_FRAME_HEIGHT_QUARTERS * 100}%`,
      }}
    >
      <span className={styles.dashboardLabel}>{widget.columnName}</span>
      <span className={styles.dashboardValue}>{value}{unit}</span>
    </div>
  );
}

export default function DashboardWidgets({widgets, latestDatapoint}){
  if(!(widgets instanceof Array)) return null;

  return widgets.map((widget) => {
    if(!(widget instanceof Object) || widget.widgetType !== 0) return null;
    return <DashboardReading key={widget.widgetId} widget={widget} latestDatapoint={latestDatapoint}/>;
  });
}
