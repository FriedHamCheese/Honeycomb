START TRANSACTION;

/*
  SHA512 Hashes output 64 bytes, but a byte needs 2 characters for hex, hence 128 bytes
  similarly, salts are 16 bytes, hex string representation is 32 bytes
*/

CREATE TABLE Device(
  deviceID BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  saltedDeviceSecret VARCHAR(128) NOT NULL,
  saltedViewingSecret VARCHAR(128) NOT NULL,
  ownerUserID BIGINT UNSIGNED NOT NULL,
  deviceSecretSalt VARCHAR(32) NOT NULL,
  deviceName VARCHAR(32) NOT NULL,
  isCompositeDevice BOOL NOT NULL
);

COMMIT;
