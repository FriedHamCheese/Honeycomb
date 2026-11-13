import express from 'express';

import {
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware,
} from '../auth.js';

import {sqlConnectionPool} from '../sqlConnectionPool.js'

import {getDashboardWidgets, postDashboardWidgets} from './dashboardController.js';

export const dashboardRouter = express.Router();

dashboardRouter.get(
  /*
    GET /apiv1/dashboard/:deviceID
    Returns the DashboardWidget rows belonging to the specified device.
    Requires the owner's user session token in the Authorization header.
  */
  /**
   * GET /apiv1/dashboard/:deviceID
   *
   * Input:
   * - Authorization: user session token
   * - URL parameter deviceID: positive integer device ID
   *
   * Returns:
   * - HTTP status 200 with {widgets: DashboardWidget[]}
   * - HTTP status 401 if the user token is invalid or the user does not own
   *   the specified device
   * - HTTP status 400 if deviceID is not a valid device ID parameter
   * - HTTP status 500 for undocumented server or database errors
   */
  '/:deviceID',
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware,
  async function (request, response){getDashboardWidgets(request, response, sqlConnectionPool);},
);

dashboardRouter.post(
  /*
  Input:
  - Authorization: user session token
  - {
    widgets: [
      {
        widgetId: unsigned 32-bit integer,
        widgetType: int, 0-255,
        columnName: str(1-32),
        xpos_quarters: int, 0-3,
        ypos_quarters: int, 0-7,
        width_quarters: int, 0-3,
        height_quarters: int, 0-7
      },
      ...
    ]
  }
  Returns:
  */
  "/:deviceID",
  deviceIDParameterValid,
  checkCachedLoginIsDeviceOwnerMiddleware,
  async function (request, response){postDashboardWidgets(request, response, sqlConnectionPool);},
);
