START TRANSACTION;

/*
  password: @?;-Vt7b0@(1h06Ie@%1{cgz
  salt: 6d16e989de5314f3eff5e0c4a24c2bf0
  sha512(password+salt): 
*/
INSERT INTO UserObject(email, saltedPassword, salt, name) VALUES(
  "jane.doe@example.com",
  "2074c70d2bd35573ae9a15c84d2bc0e5c949ac4193e09055622d349a4b05e99e37718056531df38f4f3fa9810b8a0af59e6ae3a05a34179ce976ad1ddf53b00a",
  "6d16e989de5314f3eff5e0c4a24c2bf0",
  "Jane Doe"
);

INSERT INTO DashboardWidget(deviceID, widgetId, widgetType, columnName, xpos_quarters, ypos_quarters, width_quarters, height_quarters)
  VALUES (1, 0, 0, "temperature_celsius", 0, 0, 2, 1);
INSERT INTO DashboardWidget(deviceID, widgetId, widgetType, columnName, xpos_quarters, ypos_quarters, width_quarters, height_quarters)
  VALUES (1, 1, 0, "relative_humidity_percent", 2, 0, 2, 1);
INSERT INTO DashboardWidget(deviceID, widgetId, widgetType, columnName, xpos_quarters, ypos_quarters, width_quarters, height_quarters)
  VALUES (1, 2, 0, "epoch_seconds", 0, 1, 4, 1);

COMMIT;