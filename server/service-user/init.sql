START TRANSACTION;

/*
  SHA512 Hashes output 64 bytes, but a byte needs 2 characters for hex, hence 128 bytes
  similarly, salts are 16 bytes, hex string representation is 32 bytes
*/

CREATE TABLE UserObject(
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(48) UNIQUE NOT NULL,
  saltedPassword VARCHAR(128) NOT NULL,
  salt VARCHAR(32) NOT NULL,
  name VARCHAR(32) NOT NULL
);

CREATE TABLE DashboardWidget(
  deviceID BIGINT UNSIGNED NOT NULL,
  widgetId INT UNSIGNED NOT NULL,
  widgetType TINYINT UNSIGNED NOT NULL,
  columnName VARCHAR(32) NOT NULL,
  /*
  Using 9:18, the height is exactly 2x the width, thus allowing a simple quarter grid
  */
  xpos_quarters TINYINT UNSIGNED NOT NULL,
  ypos_quarters TINYINT UNSIGNED NOT NULL,
  width_quarters TINYINT UNSIGNED NOT NULL,
  height_quarters TINYINT UNSIGNED NOT NULL,
  
  PRIMARY KEY (deviceID, widgetId)
);

COMMIT;
