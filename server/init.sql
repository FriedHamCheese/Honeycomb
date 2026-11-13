START TRANSACTION;

/*
  SHA512 Hashes output 64 bytes, but a byte needs 2 characters for hex, hence 128 bytes
  similarly, salts are 16 bytes, hex string representation is 32 bytes
*/

CREATE TABLE UserObject(
  id INT(64) PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(48) UNIQUE NOT NULL,
  saltedPassword VARCHAR(128) NOT NULL,
  salt VARCHAR(32) NOT NULL,
  name VARCHAR(32) NOT NULL
);

CREATE TABLE Device(
  deviceID INT(64) PRIMARY KEY AUTO_INCREMENT,
  saltedDeviceSecret VARCHAR(128) NOT NULL,
  saltedViewingSecret VARCHAR(128) NOT NULL,
  ownerUserID INT(64) NOT NULL REFERENCES UserObject(id),
  deviceSecretSalt VARCHAR(32) NOT NULL,
  deviceName VARCHAR(32) NOT NULL,
  isCompositeDevice BOOL NOT NULL
);

CREATE TABLE DashboardWidget(
  deviceID INT(64) NOT NULL REFERENCES Device(deviceID),
  widgetId INT UNSIGNED NOT NULL,
  widgetType INT(8) NOT NULL,
  columnName VARCHAR(32) NOT NULL,
  /*
  Using 9:16, the height is around 1.7x of width, thus needing another bit
  */
  xpos_quarters INT(2) NOT NULL,
  ypos_quarters INT(3) NOT NULL,
  width_quarters INT(2) NOT NULL,
  height_quarters INT(3) NOT NULL,
  
  PRIMARY KEY (deviceID, widgetId)
);

COMMIT;
