import styles from './DashboardWidgets.module.css';

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
        left: `${widget.xpos_quarters * 25}%`,
        top: `${widget.ypos_quarters * 25}%`,
        width: `${widget.width_quarters * 25}%`,
        height: `${widget.height_quarters * 25}%`,
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
    return <DashboardReading key={widget.id} widget={widget} latestDatapoint={latestDatapoint}/>;
  });
}
