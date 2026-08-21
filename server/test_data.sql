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

/*
deviceSecret: I!7T#'q3%uB]yP4U03llRw.1
deviceViewingSecret: Z8^8MCm3u|US7Xc=_LZo2-`V
output: sha512(arg + deviceSecretSalt).hex()
*/
INSERT INTO Device(deviceSecretSalt, saltedDeviceSecret, saltedViewingSecret, deviceName, isCompositeDevice, ownerUserID) 
  VALUES (
    "42cbfcfdff4cc24e19677c6b0b0fec91", 
    "abaa65045de02568d880eb521df94659dd8ea484e629edef0bde7ba6ffcd8f740e6978b2d7a8feec6da586e87794d279ced750c34536a15d2811f0979e517ff7",
    "4949e7b40d828c6e67221aa77014bd8d1c8d376d9cb157ebb1ce739b52f5c8267f05f9db0b704f3cdf08180ebed42a33c7ac6fe0a52bbb9ed982e683ea7a2c53",
    "DHT22",
    false,
    1
);

/*
deviceSecret: 4NaFX*^BR#5Yc4U!FbhZErAK
devicViewingSecret: Ht%@^ZCMweZ*GFD!MV5y#n6h
output: sha512(arg + deviceSecretSalt).hex()
*/
INSERT INTO Device(deviceSecretSalt, saltedDeviceSecret, saltedViewingSecret, deviceName, isCompositeDevice, ownerUserID) 
  VALUES (
    "ea484e629edef0bde7ba6ffcd8f740e6", 
    "63199af456ec48d9c1ca169d0b53c7af91c9eab8f79ed71c41ea71aa4b509b7e06ff7518973aa6dea3d14530758553e046b07433e8bf4a81f6b1b71a74ae1137",
    "d911ae79aa29278fa362b301c165e5d1b1c94136d6a24b05142e0a60185a24518ac28f8ce149ded310f1b060a364bbc654530cf40b78087e2585331d4fcad6b4",
    "MQ2",
    false,
    1
);

/*
deviceSecret: AkJir9WCYsd%zrHyJPr4xr8m
devicViewingSecret: oBoA^&B2UCamE97e%S47PNRe
output: sha512(arg + deviceSecretSalt).hex()
*/
INSERT INTO Device(deviceSecretSalt, saltedDeviceSecret, saltedViewingSecret, deviceName, isCompositeDevice, ownerUserID) 
  VALUES (
    "267f05f9db0b704f3cdf08180ebed42a", 
    "df1068b79a0c85a0fc821cd2923a15c5140972d61317ba0483743d9199ab204cd730acc9dba13eb6e3bd8e29dbd8652714bfb2e985f405f189b892fad093f816",
    "98460c5fa3056d9b313fa4f7584e27aff6e33ada06f6c88e329138e3b835c30e1fbea011ac7d1b961feb5c72c367d21c260fa17b388538b3b2972e121f1f2f44",
    "MCU Test",
    false,
    1
);

CREATE TABLE Device1_Table(
  __datapointIndex INT(64) PRIMARY KEY AUTO_INCREMENT,
  temperature_celsius FLOAT,
  relative_humidity_percent FLOAT,
  epoch_seconds FLOAT
);

INSERT INTO Device1_Table (temperature_celsius, relative_humidity_percent, epoch_seconds) VALUES(27.0, 50.0, 0.0);
INSERT INTO Device1_Table (temperature_celsius, relative_humidity_percent, epoch_seconds) VALUES(27.5, 51.5, 2.0);
INSERT INTO Device1_Table (temperature_celsius, relative_humidity_percent, epoch_seconds) VALUES(27.75, 51.0, 3.0);  

CREATE TABLE Device2_Table(
  __datapointIndex INT(64) PRIMARY KEY AUTO_INCREMENT,
  CO2_ppm FLOAT,
  epoch_seconds FLOAT  
);

INSERT INTO Device2_Table (CO2_ppm, epoch_seconds) VALUES(0.5, 0.0);
INSERT INTO Device2_Table (CO2_ppm, epoch_seconds) VALUES(0.5, 1.5);
INSERT INTO Device2_Table (CO2_ppm, epoch_seconds) VALUES(0.5, 3.75);

CREATE TABLE Device3_Table(
  __datapointIndex INT(64) PRIMARY KEY AUTO_INCREMENT,
  temperature_celsius FLOAT,
  relative_humidity_percent FLOAT,
  notes VARCHAR(32)
);

COMMIT;