import {
  HTTP_STATUS_FOR_BAD_REQUEST,
  HTTP_STATUS_FOR_SERVER_ERROR,
  MAX_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS,
  MAX_DASHBOARD_WIDGET_ID,
  MAX_SUPPORTED_DASHBOARD_WIDGET_TYPE,
  MAX_WIDGETS_PER_DEVICE,
  MIN_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS,
  MIN_DASHBOARD_WIDGET_ID,
  MIN_DASHBOARD_WIDGET_TYPE,
  MIN_DASHBOARD_WIDGET_HEIGHT_QUARTERS,
  MIN_DASHBOARD_WIDGET_WIDTH_QUARTERS,
  MIN_DASHBOARD_WIDGET_X_POSITION_QUARTERS,
  MIN_DASHBOARD_WIDGET_Y_POSITION_QUARTERS,
  DASHBOARD_FRAME_HEIGHT_QUARTERS,
  DASHBOARD_FRAME_WIDTH_QUARTERS,
} from '../../constraints.js';
import {getDeviceTableNameFromID} from './deviceLogic.js';

export async function getDashboardWidgets(request, response, sqlConnectionPool){
  try{
    const [widgets] = await sqlConnectionPool.execute(
      'SELECT * FROM Honeycomb.DashboardWidget WHERE deviceID = ?',
      [request.deviceIDInt]
    );
    response.send({widgets: widgets});
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
    throw err;
  }
}

function validateDashboardWidget(widget){
  if(!widget || typeof widget !== "object" || Array.isArray(widget))
    return "Every element in .widgets must be an object.";

  if(!Number.isInteger(widget.widgetId) || widget.widgetId < MIN_DASHBOARD_WIDGET_ID || widget.widgetId > MAX_DASHBOARD_WIDGET_ID)
    return ".widgetId of an element in .widgets is out of range.";

  const widgetTypeOutOfRange = widget.widgetType < MIN_DASHBOARD_WIDGET_TYPE || widget.widgetType > MAX_SUPPORTED_DASHBOARD_WIDGET_TYPE;
  if(!Number.isInteger(widget.widgetType) || widgetTypeOutOfRange)
    return ".widgetType of an element in .widgets is out of range.";

  if(typeof widget.columnName !== "string")
    return ".columnName of an element in .widgets must be a string.";
  const columnNameLength = widget.columnName.trim().length;
  if(columnNameLength < MIN_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS || columnNameLength > MAX_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS)
    return ".columnName of an element in .widgets has an invalid length.";

  const quarterProperties = [
    ["xpos_quarters", MIN_DASHBOARD_WIDGET_X_POSITION_QUARTERS, DASHBOARD_FRAME_WIDTH_QUARTERS],
    ["ypos_quarters", MIN_DASHBOARD_WIDGET_Y_POSITION_QUARTERS, DASHBOARD_FRAME_HEIGHT_QUARTERS],
    ["width_quarters", MIN_DASHBOARD_WIDGET_WIDTH_QUARTERS, DASHBOARD_FRAME_WIDTH_QUARTERS],
    ["height_quarters", MIN_DASHBOARD_WIDGET_HEIGHT_QUARTERS, DASHBOARD_FRAME_HEIGHT_QUARTERS],
  ];
  for(const [propertyName, minimum, maximum] of quarterProperties){
    if(!Number.isInteger(widget[propertyName]) || widget[propertyName] < minimum || widget[propertyName] > maximum)
      return `.${propertyName} of an element in .widgets is out of range.`;
  }

  if(widget.xpos_quarters + widget.width_quarters > DASHBOARD_FRAME_WIDTH_QUARTERS)
    return "Widget exceeds dashboard frame width.";
  if(widget.ypos_quarters + widget.height_quarters > DASHBOARD_FRAME_HEIGHT_QUARTERS)
    return "Widget exceeds dashboard frame height.";

  return null;
}

export async function postDashboardWidgets(request, response, sqlConnectionPool){
  if((typeof request.body) !== "object")
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: "Request body must be a JSON object."});
  if(!Array.isArray(request.body.widgets))
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: ".widgets must be an array."});
  if(request.body.widgets.length > MAX_WIDGETS_PER_DEVICE)
    return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: `.widgets exceeded maximum possible displayable widgets (${MAX_WIDGETS_PER_DEVICE})`});

  for(const widget of request.body.widgets){
    const validationError = validateDashboardWidget(widget);
    if(validationError)
      return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({error: validationError});
  }

  const sqlConnection = await sqlConnectionPool.getConnection();
  await sqlConnection.beginTransaction();

  try{
    const [columnQuery] = await sqlConnection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'Honeycomb' AND TABLE_NAME = ?",
      [getDeviceTableNameFromID(request.deviceIDStr)]
    );
    const deviceColumnNames = new Set(columnQuery.map((column) => column.COLUMN_NAME));

    const queryValues = [];
    const queryPlaceholders = [];

    for(const requestWidget of request.body.widgets){
      if(!deviceColumnNames.has(requestWidget.columnName)){
        await sqlConnection.rollback();
        sqlConnectionPool.releaseConnection(sqlConnection);
        return response.status(HTTP_STATUS_FOR_BAD_REQUEST).send({
          error: `.columnName '${requestWidget.columnName}' does not exist on this device.`
        });
      }

      queryPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?)");
      queryValues.push(
        request.deviceIDInt,
        requestWidget.widgetId,
        requestWidget.widgetType,
        requestWidget.columnName,
        requestWidget.xpos_quarters,
        requestWidget.ypos_quarters,
        requestWidget.width_quarters,
        requestWidget.height_quarters,
      );
    }

    if(queryPlaceholders.length){
      await sqlConnection.execute(
        `INSERT INTO Honeycomb.DashboardWidget
          (deviceID, widgetId, widgetType, columnName,
           xpos_quarters, ypos_quarters, width_quarters, height_quarters)
         VALUES ${queryPlaceholders.join(", ")}
         ON DUPLICATE KEY UPDATE
           widgetType = VALUES(widgetType),
           columnName = VALUES(columnName),
           xpos_quarters = VALUES(xpos_quarters),
           ypos_quarters = VALUES(ypos_quarters),
           width_quarters = VALUES(width_quarters),
           height_quarters = VALUES(height_quarters)`,
        queryValues
      );
    }
    await sqlConnection.commit();
    sqlConnectionPool.releaseConnection(sqlConnection);
    response.send({message: "Dashboard widgets updated."});
  }catch(err){
    await sqlConnection.rollback();
    sqlConnectionPool.releaseConnection(sqlConnection);
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: err});
    console.log(err);    
  }
}
