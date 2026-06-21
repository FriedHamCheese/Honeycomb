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

/*
  password: jane.doe
  salt: 6d16e989de5314f3eff5e0c4a24c2bf0
  sha512(password+salt): 
*/
INSERT INTO UserObject(email, saltedPassword, salt, name) VALUES(
  "jane.doe@example.com",
  "2229cb547700c3c1c90de6ef001e2f5f5c4e8c33fbed96cb542b0163cf92534cb18986ea6a510ee641d2ac421f3b50fe92e8367eb9969518fa5bf7de956bfca0",
  "6d16e989de5314f3eff5e0c4a24c2bf0",
  "Jane Doe"
);

/*
deviceSecret: 1
deviceViewingSecret: 1view
output: sha512(arg + "xd").hex()
*/
INSERT INTO Device(deviceSecretSalt, saltedDeviceSecret, saltedViewingSecret, deviceName, isCompositeDevice, ownerUserID) 
  VALUES (
    "xd", 
    "fc5f9e2a9f81fa58c76f2ca80270b9d7cb45f126a45c2e8e5c055b52bd0ea2bc657aed8a805b43a01c8b65778378538d7e3d839d7125d0ae072eda5b777a2e05",
    "e496958f1cab3f92f7eb6f245de3f78b2e36a29ff7b86693b0072c4e86a9905274bf180a20bedc51e7f8a1188a036e2189cbc833d53169abcb1824047bdae955",
    "DHT22",
    false,
    1
);

/*
deviceSecret: 2
devicViewingSecret: 2view
output: sha512(arg + "xd").hex()
*/
INSERT INTO Device(deviceSecretSalt, saltedDeviceSecret, saltedViewingSecret, deviceName, isCompositeDevice, ownerUserID) 
  VALUES (
    "xd", 
    "dbcee460fbc3e6a54e78e3d6f2c14e42a5cffdb98d079983a03b8c70b92e5a88a886416d1ec2821cea9120163c15b892f1bff321bdc3daf395b7f06a21a556c6",
    "6162f4f3dc7ed6cd9fe4fdb1c86fa60e7deebc7998a3e6147e88ab4cec01553160b1b151bb8872c38941f1bed36afbb6357722a5302eda53a09be21adfe4c7cb",
    "MQ2",
    false,
    1
);

CREATE TABLE 1_0(
  __datapointIndex INT(64) PRIMARY KEY AUTO_INCREMENT,
  temperature_celsius FLOAT,
  relative_humidity_percent FLOAT,
  epoch_seconds FLOAT
);

INSERT INTO 1_0 (temperature_celsius, relative_humidity_percent, epoch_seconds) VALUES(27.0, 50.0, 0.0);
INSERT INTO 1_0 (temperature_celsius, relative_humidity_percent, epoch_seconds) VALUES(27.5, 51.5, 2.0);
INSERT INTO 1_0 (temperature_celsius, relative_humidity_percent, epoch_seconds) VALUES(27.75, 51.0, 3.0);  

CREATE TABLE 2_0(
  __datapointIndex INT(64) PRIMARY KEY AUTO_INCREMENT,
  CO2_ppm FLOAT,
  epoch_seconds FLOAT  
);

INSERT INTO 2_0 (CO2_ppm, epoch_seconds) VALUES(0.5, 0.0);
INSERT INTO 2_0 (CO2_ppm, epoch_seconds) VALUES(0.5, 1.5);
INSERT INTO 2_0 (CO2_ppm, epoch_seconds) VALUES(0.5, 3.75);

COMMIT;