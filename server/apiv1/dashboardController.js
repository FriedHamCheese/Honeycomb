import {honeycombDBConnectionPool} from '../sqlConnectionPool.js';
import {HTTP_STATUS_FOR_SERVER_ERROR} from '../../constraints.js';

export async function getDashboardWidgets(request, response){
  try{
    const [widgets] = await honeycombDBConnectionPool.execute(
      'SELECT * FROM DashboardWidget WHERE deviceID = ?',
      [request.deviceIDInt]
    );
    response.send({widgets: widgets});
  }catch(err){
    response.status(HTTP_STATUS_FOR_SERVER_ERROR).send({error: String(err)});
    throw err;
  }
}
